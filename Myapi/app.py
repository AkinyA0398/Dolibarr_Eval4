from flask import Flask, request, jsonify
import sqlite3
from flask_cors import CORS
from datetime import datetime

app = Flask(__name__)
CORS(app)

DATABASE_NAME = "dolibarr.db"

def init_db():
    with sqlite3.connect(DATABASE_NAME) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS config_remise (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                payment_mode TEXT NOT NULL DEFAULT 'cash',
                label TEXT NOT NULL,
                max_days INTEGER NOT NULL,
                discount_percentage INTEGER NOT NULL
            )
        ''')
        
        # Migration automatique si la colonne payment_mode n'existe pas encore
        cursor.execute("PRAGMA table_info(config_remise)")
        columns = [col[1] for col in cursor.fetchall()]
        if 'payment_mode' not in columns:
            cursor.execute("ALTER TABLE config_remise ADD COLUMN payment_mode TEXT NOT NULL DEFAULT 'cash'")

        # Insert default data if table is empty
        cursor.execute('SELECT COUNT(*) FROM config_remise')
        if cursor.fetchone()[0] == 0:
            default_remises = [
                ('cash', 'Maintenant', 0, 30),
                ('cash', 'Moins de 1 semaine (7 jours)', 7, 15),
                ('cash', 'Moins de 1 mois (30 jours)', 30, 10),
                ('cash', '+ de 1 mois', 9999, 0),
                
                ('cheque', 'Maintenant', 0, 30),
                ('cheque', 'Moins de 1 semaine (7 jours)', 7, 15),
                ('cheque', 'Moins de 1 mois (30 jours)', 30, 10),
                ('cheque', '+ de 1 mois', 9999, 0),

                ('cb', 'Maintenant', 0, 30),
                ('cb', 'Moins de 1 semaine (7 jours)', 7, 15),
                ('cb', 'Moins de 1 mois (30 jours)', 30, 10),
                ('cb', '+ de 1 mois', 9999, 0),
            ]
            cursor.executemany('''
                INSERT INTO config_remise (payment_mode, label, max_days, discount_percentage)
                VALUES (?, ?, ?, ?)
            ''', default_remises)
            print("\n✨ [SUCCESS] Base de données initialisée proprement (config_remise) !\n")

init_db()

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
    data = request.get_json() or {}
    payment_mode = data.get('payment_mode', 'cash')
    label = data.get('label')
    max_days = data.get('max_days')
    discount = data.get('discount_percentage')

    if not label or max_days is None or discount is None:
        return jsonify({'error': 'Champs manquants (label, max_days ou discount_percentage)'}), 400

    try:
        max_days = int(max_days)
        discount = int(discount)
    except (TypeError, ValueError):
        return jsonify({'error': 'max_days et discount_percentage doivent être des entiers'}), 400

    with sqlite3.connect(DATABASE_NAME) as conn:
        cursor = conn.cursor()
        cursor.execute(
            'INSERT INTO config_remise (payment_mode, label, max_days, discount_percentage) VALUES (?, ?, ?, ?)',
            (payment_mode, label, max_days, discount)
        )
        new_id = cursor.lastrowid
        conn.commit()

    return jsonify({
        'id': new_id,
        'payment_mode': payment_mode,
        'label': label,
        'max_days': max_days,
        'discount_percentage': discount
    }), 201

@app.route('/api/remises/<int:remise_id>', methods=['PUT'])
def update_remise(remise_id):
    data = request.get_json() or {}
    discount = data.get('discount_percentage')
    max_days = data.get('max_days')
    label = data.get('label')
    payment_mode = data.get('payment_mode')

    if discount is None:
        return jsonify({'error': 'discount_percentage manquant'}), 400

    try:
        discount = int(discount)
        if max_days is not None:
            max_days = int(max_days)
    except (TypeError, ValueError):
        return jsonify({'error': 'Format de données invalide'}), 400

    with sqlite3.connect(DATABASE_NAME) as conn:
        cursor = conn.cursor()
        
        # Mise à jour dynamique selon ce qui est transmis par le front
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