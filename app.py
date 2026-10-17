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

def normalize_google_sheet_url(url):
    """Normalize Google Sheets URL to a direct CSV export link."""
    if not url:
        return ""
    url = url.strip()
    match = re.search(r'docs\.google\.com/spreadsheets/d/([a-zA-Z0-9-_]+)', url)
    if not match:
        return url
    sheet_id = match.group(1)
    gid_match = re.search(r'[#&?]gid=([0-9]+)', url)
    gid_param = f'&gid={gid_match.group(1)}' if gid_match else ''
    return f'https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv{gid_param}'

def find_id_and_name_columns(columns):
    """Identify which columns represent the School ID and the Student Name."""
    id_col = None
    name_col = None
    for col in columns:
        cleaned = re.sub(r'[^a-zA-Z0-9]', '', str(col)).lower()
        if not id_col and any(k in cleaned for k in ['schoolid', 'studentid', 'idnumber', 'idnum', 'schoolno', 'id']):
            id_col = col
        if not name_col and any(k in cleaned for k in ['studentname', 'fullname', 'nameexjuansdelacruz', 'name']):
            name_col = col
    if not id_col and len(columns) >= 2:
        id_col = columns[0]
    if not name_col and len(columns) >= 2:
        name_col = columns[1] if id_col != columns[1] else columns[0]
    return id_col, name_col

def parse_spreadsheet_text(raw_text):
    """Parse pasted spreadsheet data (TSV, CSV, or semicolon-delimited) into student records."""
    if not raw_text or not raw_text.strip():
        return [], None, None, "No data provided"

    cleaned_text = raw_text.strip()
    first_line = cleaned_text.splitlines()[0]

    # Delimiter detection: clipboard data from Google Sheets/Excel uses tabs (\t).
    # Since student names frequently contain commas ("Dela Cruz, Juan"), prioritize tab if present.
    if '\t' in first_line:
        detected_sep = '\t'
    elif ',' in first_line:
        detected_sep = ','
    elif ';' in first_line:
        detected_sep = ';'
    else:
        detected_sep = None

    tokens = [t.strip() for t in (first_line.split(detected_sep) if detected_sep else [first_line])]
    first_token = tokens[0] if tokens else ""

    # Determine if first line is a data row or a header row
    has_header = True
    if re.match(r'^\d{4}', first_token) or (len(first_token) > 0 and first_token[0].isdigit()):
        has_header = False

    try:
        if has_header:
            df = pd.read_csv(StringIO(cleaned_text), sep=detected_sep, engine='python')
            df.columns = [str(c).strip() for c in df.columns]
            id_col, name_col = find_id_and_name_columns(df.columns.tolist())
        else:
            df = pd.read_csv(StringIO(cleaned_text), sep=detected_sep, engine='python', header=None)
            id_col = 0
            name_col = 1 if df.shape[1] > 1 else 0

        if id_col is None:
            return [], None, None, "Could not determine School ID column"

        records = []
        seen_ids = set()

        for _, row in df.iterrows():
            raw_id = row[id_col]
            if pd.isna(raw_id):
                continue
            cleaned_id = re.sub(r'\s+', '', str(raw_id)).replace('.0', '').strip()
            if not cleaned_id or cleaned_id.lower() in ['nan', 'none', 'null']:
                continue

            raw_name = row[name_col] if name_col is not None and name_col in row else ''
            cleaned_name = str(raw_name).strip() if pd.notna(raw_name) else ''
            if cleaned_name.lower() in ['nan', 'none', 'null']:
                cleaned_name = ''

            # Skip duplicate entries in the same import batch
            if cleaned_id in seen_ids:
                continue
            seen_ids.add(cleaned_id)

            records.append({
                'school_id': cleaned_id,
                'name': cleaned_name or f"Student {cleaned_id}"
            })

        if not records:
            return [], str(id_col), str(name_col), "No valid student records found in pasted data"

        return records, str(id_col), str(name_col), None

    except Exception as e:
        return [], None, None, f"Failed to parse spreadsheet data: {str(e)}"

def apply_student_records(records, mode='replace'):
    """Insert or update student records in database."""
    if not records:
        return 0

    if mode == 'replace':
        db.session.query(Student).delete()
        db.session.commit()
        for rec in records:
            db.session.add(Student(school_id=rec['school_id'], name=rec['name']))
        db.session.commit()
        count = len(records)
    else:
        # Upsert mode
        count = 0
        for rec in records:
            student = Student.query.filter_by(school_id=rec['school_id']).first()
            if student:
                student.name = rec['name']
            else:
                db.session.add(Student(school_id=rec['school_id'], name=rec['name']))
            count += 1
        db.session.commit()

    socketio.emit('student_data_updated', {'message': f'{count} student records updated'})
    return count

def import_sheet_to_db():
    sheet_url = get_spreadsheet_link()
    if not sheet_url:
        return False, "Spreadsheet URL missing"

    try:
        response = requests.get(sheet_url, timeout=15)
        response.raise_for_status()

        records, _, _, err = parse_spreadsheet_text(response.text)
        if err:
            return False, err

        count = apply_student_records(records, mode='replace')
        return True, f"Successfully synchronized {count} student records"

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
    """Save the spreadsheet link in settings table, normalizing Google Docs URLs."""
    normalized = normalize_google_sheet_url(new_link)
    setting = Settings.query.filter_by(key='spreadsheet_link').first()
    if setting:
        setting.value = normalized
    else:
        db.session.add(Settings(key='spreadsheet_link', value=normalized))
    db.session.commit()
    return normalized

@app.route('/settings')
def settings():
    return render_template('settings.html')

@app.route('/api/settings', methods=['GET'])
def api_get_settings():
    try:
        current_link = get_spreadsheet_link() or ''
        student_count = Student.query.count()
        return jsonify({
            'status': 'Success',
            'data': {
                'spreadsheet_link': current_link,
                'student_count': student_count
            }
        })
    except Exception as e:
        return jsonify({'status': 'Error', 'message': str(e)}), 500

@app.route('/api/settings/link', methods=['POST'])
def api_update_link():
    payload = request.get_json() or {}
    new_link = payload.get('spreadsheet_link', '').strip()
    sync_now = payload.get('sync_now', False)

    if not new_link:
        return jsonify({'status': 'Error', 'message': 'Spreadsheet URL cannot be empty.'}), 400

    try:
        saved_link = update_spreadsheet_link(new_link)
        sync_result = None

        if sync_now:
            ok, msg = import_sheet_to_db()
            sync_result = {'success': ok, 'message': msg}
            if not ok:
                return jsonify({
                    'status': 'Warning',
                    'message': f'Link saved, but sync failed: {msg}',
                    'spreadsheet_link': saved_link,
                    'sync': sync_result
                })

        student_count = Student.query.count()
        return jsonify({
            'status': 'Success',
            'message': 'Spreadsheet URL updated and synchronized successfully.',
            'spreadsheet_link': saved_link,
            'student_count': student_count,
            'sync': sync_result
        })
    except Exception as e:
        return jsonify({'status': 'Error', 'message': str(e)}), 500

@app.route('/api/settings/preview', methods=['POST'])
def api_preview_pasted_data():
    payload = request.get_json() or {}
    raw_text = payload.get('raw_data', '')

    records, id_col, name_col, err = parse_spreadsheet_text(raw_text)
    if err:
        return jsonify({'status': 'Error', 'message': err}), 400

    preview_rows = records[:5]
    return jsonify({
        'status': 'Success',
        'count': len(records),
        'id_column': id_col,
        'name_column': name_col,
        'preview': preview_rows
    })

@app.route('/api/settings/import', methods=['POST'])
def api_import_pasted_data():
    payload = request.get_json() or {}
    raw_text = payload.get('raw_data', '')
    mode = payload.get('mode', 'replace')

    if mode not in ['replace', 'upsert']:
        mode = 'replace'

    records, _, _, err = parse_spreadsheet_text(raw_text)
    if err:
        return jsonify({'status': 'Error', 'message': err}), 400

    try:
        count = apply_student_records(records, mode=mode)
        student_count = Student.query.count()
        return jsonify({
            'status': 'Success',
            'message': f'Successfully updated database with {count} student records.',
            'count': count,
            'total_students': student_count
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'status': 'Error', 'message': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3005, debug=True)

