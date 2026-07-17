from flask import Flask, request, jsonify
import sqlite3
from flask_cors import CORS
from datetime import datetime

app = Flask(__name__)
CORS(app)

DATABASE_NAME = "dolibarr.db"

def init_db():
    with sqlite3.connect(DATABASE_NAME) as conn:
        #cursor = conn.cursor()
        
    #     # 🛠️ Nettoyage de sécurité pour appliquer la structure propre
    #     cursor.execute('DROP TABLE IF EXISTS jours_feries')
        
    #     cursor.execute('''
    #         CREATE TABLE IF NOT EXISTS jours_feries (
    #             id INTEGER PRIMARY KEY AUTOINCREMENT,
    #             titre TEXT NOT NULL,
    #             date_ferie TEXT NOT NULL, -- Stocké au format 'YYYY-MM-DD'
    #             est_recurrent INTEGER DEFAULT 1, -- 1 = Standard/Récurrent, 0 = Unique
    #             annee INTEGER DEFAULT NULL
    #         )
    #     ''')
    #     cursor.execute('CREATE INDEX IF NOT EXISTS idx_date_ferie ON jours_feries(date_ferie)')
    # print("\n✨ [SUCCESS] Base de données initialisée proprement !\n")

init_db()

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)