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
                label TEXT NOT NULL,
                max_days INTEGER NOT NULL,
                discount_percentage INTEGER NOT NULL
            )
        ''')
        # Insert default data if table is empty
        cursor.execute('SELECT COUNT(*) FROM config_remise')
        if cursor.fetchone()[0] == 0:
            default_remises = [
                ('Maintenant', 0, 30),
                ('Moins de 1 semaine (7 jours)', 7, 15),
                ('Moins de 1 mois (30 jours)', 30, 10),
                ('+ de 1 mois', 9999, 0)
            ]
            cursor.executemany('''
                INSERT INTO config_remise (label, max_days, discount_percentage)
                VALUES (?, ?, ?)
            ''', default_remises)
            print("\n✨ [SUCCESS] Base de données initialisée proprement (config_remise) !\n")


init_db()


@app.route('/api/remises', methods=['GET'])
def get_remises():
    with sqlite3.connect(DATABASE_NAME) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT id, label, max_days, discount_percentage FROM config_remise ORDER BY max_days ASC')
        rows = cursor.fetchall()
        remises = [{'id': r[0], 'label': r[1], 'max_days': r[2], 'discount_percentage': r[3]} for r in rows]
    return jsonify(remises)


@app.route('/api/remises/<int:remise_id>', methods=['PUT'])
def update_remise(remise_id):
    data = request.get_json() or {}
    discount = data.get('discount_percentage')

    if discount is None:
        return jsonify({'error': 'discount_percentage manquant'}), 400

    try:
        discount = int(discount)
    except (TypeError, ValueError):
        return jsonify({'error': 'discount_percentage doit être un entier'}), 400

    if discount < 0 or discount > 100:
        return jsonify({'error': 'discount_percentage doit être compris entre 0 et 100'}), 400

    with sqlite3.connect(DATABASE_NAME) as conn:
        cursor = conn.cursor()
        cursor.execute(
            'UPDATE config_remise SET discount_percentage = ? WHERE id = ?',
            (discount, remise_id)
        )
        if cursor.rowcount == 0:
            return jsonify({'error': 'Remise introuvable'}), 404
        conn.commit()

    return jsonify({'success': True, 'id': remise_id, 'discount_percentage': discount})


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)