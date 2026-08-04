import sqlite3
from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime, date

app = Flask(__name__)
CORS(app)

DATABASE_NAME = "dolibarr.db"

def init_db():
    with sqlite3.connect(DATABASE_NAME) as conn:
        cursor = conn.cursor()

        # ── Table config_remise ───────────────────────────────────────────
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS config_remise (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                payment_mode TEXT NOT NULL DEFAULT 'cash',
                label TEXT NOT NULL,
                max_days REAL NOT NULL,
                discount_percentage REAL NOT NULL
            )
        ''')

        # Migration automatique si la colonne payment_mode n'existe pas encore
        cursor.execute("PRAGMA table_info(config_remise)")
        columns = [col[1] for col in cursor.fetchall()]
        if 'payment_mode' not in columns:
            cursor.execute("ALTER TABLE config_remise ADD COLUMN payment_mode TEXT NOT NULL DEFAULT 'cash'")

        # Migration pour supporter les décimales dans discount_percentage et max_days
        cursor.execute("PRAGMA table_info(config_remise)")
        col_info = {col[1]: col[2] for col in cursor.fetchall()}
        if col_info.get('max_days') == 'INTEGER' or col_info.get('discount_percentage') == 'INTEGER':
            try:
                cursor.execute('ALTER TABLE config_remise RENAME TO config_remise_old')
                cursor.execute('''
                    CREATE TABLE config_remise (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        payment_mode TEXT NOT NULL DEFAULT 'cash',
                        label TEXT NOT NULL,
                        max_days REAL NOT NULL,
                        discount_percentage REAL NOT NULL
                    )
                ''')
                cursor.execute('''
                    INSERT INTO config_remise (id, payment_mode, label, max_days, discount_percentage)
                    SELECT id, payment_mode, label, max_days, discount_percentage FROM config_remise_old
                ''')
                cursor.execute('DROP TABLE config_remise_old')
                print("\n✨ [MIGRATION] Conversion en REAL pour max_days et discount_percentage !\n")
            except Exception as e:
                print(f"⚠️  Migration skipped: {e}")

        # Insert default data if table is empty
        cursor.execute('SELECT COUNT(*) FROM config_remise')
        if cursor.fetchone()[0] == 0:
            default_remises = [
                ('cash', 'Maintenant', 0, 30),
                ('cash', 'Moins de 1 semaine (7 jours)', 7, 20),
                ('cash', 'Moins de 15 jours', 15, 15),
                ('cash', 'Moins de 1 mois (30 jours)', 30, 7.5),
                ('cash', '+ de 1 mois', 9999, 0),

                ('cheque', 'Maintenant', 0, 30),
                ('cheque', 'Moins de 1 semaine (7 jours)', 7, 20),
                ('cheque', 'Moins de 15 jours', 15, 15),
                ('cheque', 'Moins de 1 mois (30 jours)', 30, 7.5),
                ('cheque', '+ de 1 mois', 9999, 0),

                ('cb', 'Maintenant', 0, 30),
                ('cb', 'Moins de 1 semaine (7 jours)', 7, 20),
                ('cb', 'Moins de 15 jours', 15, 15),
                ('cb', 'Moins de 1 mois (30 jours)', 30, 7.5),
                ('cb', '+ de 1 mois', 9999, 0),
            ]
            cursor.executemany('''
                INSERT INTO config_remise (payment_mode, label, max_days, discount_percentage)
                VALUES (?, ?, ?, ?)
            ''', default_remises)
            print("\n✨ [SUCCESS] Base de données initialisée proprement (config_remise) !\n")

        # ── Table remboursements ──────────────────────────────────────────
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS remboursements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                invoice_ref TEXT NOT NULL UNIQUE,
                invoice_id TEXT,
                montant_rembourse REAL NOT NULL DEFAULT 0,
                paye_avant REAL NOT NULL DEFAULT 0,
                cashback_avant REAL NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                date_remboursement TEXT DEFAULT NULL,
                date_annulation TEXT DEFAULT NULL,
                cashback_apres_annulation REAL DEFAULT NULL,
                remise_appliquee REAL DEFAULT NULL,
                payment_mode TEXT DEFAULT 'cash'
            )
        ''')

        # ── Migrations pour table remboursements (colonnes nouvelles) ─────
        cursor.execute("PRAGMA table_info(remboursements)")
        remb_cols = [col[1] for col in cursor.fetchall()]

        for col_name, col_def in [
            ('date_remboursement', 'TEXT DEFAULT NULL'),
            ('date_annulation',    'TEXT DEFAULT NULL'),
            ('cashback_apres_annulation', 'REAL DEFAULT NULL'),
            ('remise_appliquee',   'REAL DEFAULT NULL'),
            ('payment_mode',       "TEXT DEFAULT 'cash'"),
        ]:
            if col_name not in remb_cols:
                cursor.execute(f'ALTER TABLE remboursements ADD COLUMN {col_name} {col_def}')
                print(f"\n✨ [MIGRATION] Colonne '{col_name}' ajoutée à remboursements !\n")

        # ── Tables legacy (conservées pour rétro-compatibilité) ───────────
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS dateRemboursement (
                id INTEGER,
                date_remboursement TEXT NOT NULL DEFAULT (datetime('now'))
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS dateRemboursementAnnulation (
                id INTEGER,
                date_annulation TEXT NOT NULL DEFAULT (datetime('now'))
            )
        ''')

        conn.commit()

init_db()


# ══════════════════════════════════════════════════════════════════════════════
# HELPER : calcul remise selon intervalle jours
# ══════════════════════════════════════════════════════════════════════════════

def get_remise_for_interval(nb_jours, payment_mode='cash'):
    """
    Retourne le discount_percentage applicable selon le nb de jours écoulé
    et le mode de paiement, en lisant la config depuis config_remise.
    La sélection suit la logique : on prend la première tranche dont max_days >= nb_jours,
    triée par max_days ASC.
    Pour nb_jours == 0 (même jour), on prend la tranche max_days == 0 (Maintenant).
    """
    with sqlite3.connect(DATABASE_NAME) as conn:
        cursor = conn.cursor()
        cursor.execute(
            '''SELECT max_days, discount_percentage
               FROM config_remise
               WHERE payment_mode = ?
               ORDER BY max_days ASC''',
            (payment_mode,)
        )
        rows = cursor.fetchall()

    if not rows:
        return 0.0

    # Trouver la première tranche dont max_days >= nb_jours
    for max_days, discount_pct in rows:
        if nb_jours <= max_days:
            return float(discount_pct)

    # Si aucune tranche ne correspond (nb_jours > toutes les tranches), retourner 0
    return 0.0


def parse_date_str(date_str):
    """Parse une date au format YYYY-MM-DD ou DD/MM/YYYY → objet date."""
    if not date_str:
        return None
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d %H:%M:%S'):
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue
    return None


# ══════════════════════════════════════════════════════════════════════════════
# REMBOURSEMENTS ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.route('/api/remboursements', methods=['GET'])
def get_remboursements():
    with sqlite3.connect(DATABASE_NAME) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, invoice_ref, invoice_id, montant_rembourse, paye_avant, cashback_avant,
                   created_at, date_remboursement, date_annulation, cashback_apres_annulation,
                   remise_appliquee, payment_mode
            FROM remboursements
            ORDER BY created_at DESC
        ''')
        rows = cursor.fetchall()
        result = [{
            'id':                      r[0],
            'invoice_ref':             r[1],
            'invoice_id':              r[2],
            'montant_rembourse':       r[3],
            'paye_avant':              r[4],
            'cashback_avant':          r[5],
            'created_at':              r[6],
            'date_remboursement':      r[7],
            'date_annulation':         r[8],
            'cashback_apres_annulation': r[9],
            'remise_appliquee':        r[10],
            'payment_mode':            r[11],
        } for r in rows]
    return jsonify(result)


@app.route('/api/remboursements', methods=['POST'])
def create_remboursement():
    data = request.get_json() or {}
    invoice_ref        = data.get('invoice_ref')
    invoice_id         = data.get('invoice_id', '')
    montant_rembourse  = data.get('montant_rembourse', 0)
    paye_avant         = data.get('paye_avant', 0)
    cashback_avant     = data.get('cashback_avant', 0)
    date_remboursement = data.get('date_remboursement') or date.today().isoformat()
    payment_mode       = data.get('payment_mode', 'cash')

    if not invoice_ref:
        return jsonify({'error': 'invoice_ref manquant'}), 400

    try:
        with sqlite3.connect(DATABASE_NAME) as conn:
            cursor = conn.cursor()
            cursor.execute(
                '''INSERT INTO remboursements
                   (invoice_ref, invoice_id, montant_rembourse, paye_avant, cashback_avant,
                    date_remboursement, payment_mode)
                   VALUES (?, ?, ?, ?, ?, ?, ?)''',
                (invoice_ref, str(invoice_id), float(montant_rembourse),
                 float(paye_avant), float(cashback_avant),
                 date_remboursement, payment_mode)
            )
            new_id = cursor.lastrowid
            conn.commit()
        return jsonify({
            'id':                 new_id,
            'invoice_ref':        invoice_ref,
            'invoice_id':         invoice_id,
            'montant_rembourse':  montant_rembourse,
            'paye_avant':         paye_avant,
            'cashback_avant':     cashback_avant,
            'date_remboursement': date_remboursement,
            'payment_mode':       payment_mode,
        }), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Cette facture a déjà été remboursée'}), 409


@app.route('/api/remboursements/<int:remb_id>/annuler', methods=['POST'])
def annuler_remboursement(remb_id):
    """
    Calcule le cashback après annulation selon l'intervalle de jours
    entre date_remboursement et date_annulation, puis enregistre l'annulation.
    Le remboursement est ensuite supprimé (annulé = retiré de la liste active).
    Retourne le cashback_apres_annulation pour mise à jour du frontend.
    """
    data             = request.get_json() or {}
    date_annulation  = data.get('date_annulation') or date.today().isoformat()
    payment_mode     = data.get('payment_mode', 'cash')

    with sqlite3.connect(DATABASE_NAME) as conn:
        cursor = conn.cursor()

        # Récupérer le remboursement
        cursor.execute(
            '''SELECT id, invoice_ref, cashback_avant, date_remboursement, payment_mode
               FROM remboursements WHERE id = ?''',
            (remb_id,)
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({'error': 'Remboursement introuvable'}), 404

        remb_id_db, invoice_ref, cashback_avant, date_remb_str, remb_payment_mode = row

        # Utiliser le payment_mode du remboursement en priorité, sinon celui fourni
        effective_mode = remb_payment_mode or payment_mode or 'cash'

        # Calculer l'intervalle en jours
        d_remb   = parse_date_str(date_remb_str) or date.today()
        d_annul  = parse_date_str(date_annulation) or date.today()
        nb_jours = max(0, (d_annul - d_remb).days)

        # Récupérer le % de remise applicable
        remise_pct = get_remise_for_interval(nb_jours, effective_mode)

        # Calculer le cashback après annulation
        cashback_avant_val       = float(cashback_avant or 0)
        cashback_apres_annulation = round(cashback_avant_val * (remise_pct / 100.0), 2)

        print(f"\n📊 [ANNULATION] ref={invoice_ref} | {nb_jours}j | mode={effective_mode} | "
              f"remise={remise_pct}% | cashback_avant={cashback_avant_val} | "
              f"cashback_après={cashback_apres_annulation}\n")

        # Sauvegarder les infos d'annulation avant suppression
        cursor.execute(
            '''UPDATE remboursements
               SET date_annulation = ?,
                   cashback_apres_annulation = ?,
                   remise_appliquee = ?
               WHERE id = ?''',
            (date_annulation, cashback_apres_annulation, remise_pct, remb_id)
        )

        # Supprimer le remboursement (annulation = retrait de la liste)
        cursor.execute('DELETE FROM remboursements WHERE id = ?', (remb_id,))
        conn.commit()

    return jsonify({
        'success':                   True,
        'id':                        remb_id,
        'invoice_ref':               invoice_ref,
        'nb_jours':                  nb_jours,
        'remise_appliquee':          remise_pct,
        'cashback_avant':            cashback_avant_val,
        'cashback_apres_annulation': cashback_apres_annulation,
        'date_annulation':           date_annulation,
        'payment_mode':              effective_mode,
    })


@app.route('/api/remboursements/<int:remb_id>', methods=['DELETE'])
def delete_remboursement(remb_id):
    with sqlite3.connect(DATABASE_NAME) as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM remboursements WHERE id = ?', (remb_id,))
        if cursor.rowcount == 0:
            return jsonify({'error': 'Remboursement introuvable'}), 404
        conn.commit()
    return jsonify({'success': True, 'id': remb_id})


@app.route('/api/remboursements/by-ref/<path:invoice_ref>', methods=['DELETE'])
def delete_remboursement_by_ref(invoice_ref):
    with sqlite3.connect(DATABASE_NAME) as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM remboursements WHERE invoice_ref = ?', (invoice_ref,))
        if cursor.rowcount == 0:
            return jsonify({'error': 'Remboursement introuvable pour cette référence'}), 404
        conn.commit()
    return jsonify({'success': True, 'invoice_ref': invoice_ref})


# ══════════════════════════════════════════════════════════════════════════════
# DATE REMBOURSEMENT (legacy — conservé pour rétro-compatibilité)
# ══════════════════════════════════════════════════════════════════════════════

@app.route('/api/dateRemboursement', methods=['GET'])
def get_dateRemboursement():
    with sqlite3.connect(DATABASE_NAME) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT id, date_remboursement FROM dateRemboursement ORDER BY date_remboursement DESC')
        rows = cursor.fetchall()
        result = [{'id': r[0], 'date_remboursement': r[1]} for r in rows]
    return jsonify(result)


@app.route('/api/dateAnnulation', methods=['GET'])
def get_dateAnnulation():
    with sqlite3.connect(DATABASE_NAME) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT id, date_annulation FROM dateRemboursementAnnulation ORDER BY date_annulation DESC')
        rows = cursor.fetchall()
        result = [{'id': r[0], 'date_annulation': r[1]} for r in rows]
    return jsonify(result)


# ══════════════════════════════════════════════════════════════════════════════
# REMISES ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.route('/api/remises', methods=['GET'])
def get_remises():
    mode = request.args.get('mode', 'cash')
    with sqlite3.connect(DATABASE_NAME) as conn:
        cursor = conn.cursor()
        cursor.execute(
            'SELECT id, label, max_days, discount_percentage FROM config_remise WHERE payment_mode = ? ORDER BY max_days ASC',
            (mode,)
        )
        rows = cursor.fetchall()
        remises = [{'id': r[0], 'label': r[1], 'max_days': r[2], 'discount_percentage': r[3]} for r in rows]
    return jsonify(remises)


@app.route('/api/remises', methods=['POST'])
def create_remise():
    data         = request.get_json() or {}
    payment_mode = data.get('payment_mode', 'cash')
    label        = data.get('label')
    max_days     = data.get('max_days')
    discount     = data.get('discount_percentage')

    if not label or max_days is None or discount is None:
        return jsonify({'error': 'Champs manquants (label, max_days ou discount_percentage)'}), 400

    try:
        max_days = float(max_days)
        discount = float(discount)
    except (TypeError, ValueError):
        return jsonify({'error': 'max_days et discount_percentage doivent être des nombres'}), 400

    with sqlite3.connect(DATABASE_NAME) as conn:
        cursor = conn.cursor()
        cursor.execute(
            'INSERT INTO config_remise (payment_mode, label, max_days, discount_percentage) VALUES (?, ?, ?, ?)',
            (payment_mode, label, max_days, discount)
        )
        new_id = cursor.lastrowid
        conn.commit()

    return jsonify({
        'id':                  new_id,
        'payment_mode':        payment_mode,
        'label':               label,
        'max_days':            max_days,
        'discount_percentage': discount,
    }), 201


@app.route('/api/remises/<int:remise_id>', methods=['PUT'])
def update_remise(remise_id):
    data         = request.get_json() or {}
    discount     = data.get('discount_percentage')
    max_days     = data.get('max_days')
    label        = data.get('label')
    payment_mode = data.get('payment_mode')

    if discount is None:
        return jsonify({'error': 'discount_percentage manquant'}), 400

    try:
        discount = float(discount)
        if max_days is not None:
            max_days = float(max_days)
    except (TypeError, ValueError):
        return jsonify({'error': 'Format de données invalide'}), 400

    with sqlite3.connect(DATABASE_NAME) as conn:
        cursor = conn.cursor()

        if label is not None and max_days is not None:
            cursor.execute(
                'UPDATE config_remise SET label = ?, max_days = ?, discount_percentage = ? WHERE id = ?',
                (label, max_days, discount, remise_id)
            )
        else:
            cursor.execute(
                'UPDATE config_remise SET discount_percentage = ? WHERE id = ?',
                (discount, remise_id)
            )

        if cursor.rowcount == 0:
            return jsonify({'error': 'Remise introuvable'}), 404
        conn.commit()

    return jsonify({'success': True, 'id': remise_id, 'discount_percentage': discount})


@app.route('/api/remises/<int:remise_id>', methods=['DELETE'])
def delete_remise(remise_id):
    with sqlite3.connect(DATABASE_NAME) as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM config_remise WHERE id = ?', (remise_id,))
        if cursor.rowcount == 0:
            return jsonify({'error': 'Remise introuvable'}), 404
        conn.commit()

    return jsonify({'success': True, 'id': remise_id})


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)