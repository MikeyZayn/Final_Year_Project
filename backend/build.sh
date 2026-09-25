#!/usr/bin/env bash
set -o errexit

pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --no-input
python manage.py shell -c "from accounts.models import User; u, _ = User.objects.get_or_create(phone='0813109193', defaults={'username': '0813109193', 'role': 'admin'}); u.set_password('AdminPass123!'); u.is_staff = True; u.is_superuser = True; u.save(); print('superuser ready')"