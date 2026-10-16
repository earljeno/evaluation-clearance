from flask import Flask, request, jsonify, render_template
import pandas as pd
import requests, time
from io import StringIO
import re
from config import Config
from sqlalchemy import text
from models.models import db, Student, Settings
from flask_socketio import SocketIO
from waitress import serve
from apscheduler.schedulers.background import BackgroundScheduler

app = Flask(__name__)
app.config.from_object(Config)

db.init_app(app)
socketio = SocketIO(app)

_last_refresh_time = 0

def get_spreadsheet_link():
    setting = Settings.query.filter_by(key='spreadsheet_link').first()
    return setting.value if setting else None

def import_sheet_to_db():
    sheet_url = get_spreadsheet_link()
    if not sheet_url:
        return False, "Spreadsheet URL missing"

    try:
        response = requests.get(sheet_url)
        response.raise_for_status()

        df = pd.read_csv(StringIO(response.text))
        df.columns = [str(col).strip() for col in df.columns]
        df['School ID Number'] = (
            df['School ID Number']
            .astype(str)
            .apply(lambda x: re.sub(r'\s+', '', x))
            .str.replace('.0', '')
            .str.strip()
        )

        db.session.query(Student).delete()
        db.session.commit

        # UPSERT logic instead of TRUNCATE
        for _, row in df.iterrows():
            student = Student.query.filter_by(school_id=row['School ID Number']).first()
            if student:
                student.name = row['Name (Ex. Juan S. Dela Cruz)']
            else:
                db.session.add(Student(
                    school_id=row['School ID Number'],
                    name=row['Name (Ex. Juan S. Dela Cruz)']
                ))
        db.session.commit()

        return True, "Student data updated"

    except Exception as e:
        return False, str(e)

def refresh_student_data():
    global _last_refresh_time
    cooldown = 10
    now = time.time()
    if now - _last_refresh_time < cooldown:
        return False, "Cooldown active"

    _last_refresh_time = now
    ok, msg = import_sheet_to_db()
    if ok:
        socketio.emit('student_data_updated', {'message': 'Student data updated'})
    return ok, msg


# Scheduler will start but first run delayed
scheduler = BackgroundScheduler()
scheduler.add_job(refresh_student_data, trigger="interval", hours=1, next_run_time=None)
scheduler.start()


@app.route('/')
def index():
    return render_template('index.html')

@app.route('/viewer')
def viewer():
    return render_template('viewer.html')


@app.route('/api/check', methods=['POST'])
def api_check():
    data = request.get_json()
    search_by = data.get('search_by')
    query = data.get('query', '').strip()
    if not query:
        return jsonify({'status': 'Empty', 'message': ''})

    try:
        student = (Student.query.filter_by(school_id=query).first()
                   if search_by == 'id'
                   else Student.query.filter(Student.name.ilike(f'%{query}%')).first())
        if student:
            return jsonify({
                'status': 'Cleared',
                'message': 'Cleared!',
                'data': {'id': student.school_id, 'name': student.name}
            })
        return jsonify({'status': 'Not Found', 'message': 'No Evaluation yet ❌'})
    except Exception as e:
        return jsonify({'status': 'Error', 'message': str(e)})


@app.route('/api/save_response', methods=['POST'])
def save_response():
    data = request.get_json()
    student_id = data.get('student_id')
    responses = data.get('responses')
    if not student_id or not responses:
        return jsonify({'status': 'Error', 'message': 'Missing fields'})
    try:
        student = Student.query.filter_by(school_id=student_id).first()
        if not student:
            return jsonify({'status': 'Error', 'message': 'Student not found'})
        db.session.commit()
        socketio.emit('survey_response_saved',
                    {'message': f'Survey saved for {student_id}'}, broadcast=True)
        return jsonify({'status': 'Success', 'message': 'Responses saved'})
    except Exception as e:
        return jsonify({'status': 'Error', 'message': str(e)})


@app.route('/api/refresh', methods=['POST'])
def refresh_data():
    ok, msg = refresh_student_data()
    return jsonify({'status': 'Success' if ok else 'Error', 'message': msg})


@socketio.on('connect')
def handle_connect():
    print("Client connected")


@socketio.on('disconnect')
def handle_disconnect():
    print("Client disconnected")


def update_spreadsheet_link(new_link):
    # Ensure new_link is CSV export URL
    setting = Settings.query.filter_by(key='spreadsheet_link').first()
    if setting:
        setting.value = new_link
    else:
        db.session.add(Settings(key='spreadsheet_link', value=new_link))
    db.session.commit()


if __name__ == '__main__':
   app.run(host='0.0.0.0', port=3005, debug=True)
