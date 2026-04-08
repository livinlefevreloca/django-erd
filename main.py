"""Quick dev server for testing django-erd as a Django app."""

import os
import sys


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "testproject.settings")
    sys.path.insert(0, os.path.dirname(__file__))

    from django.core.management import execute_from_command_line

    execute_from_command_line(["manage.py", "runserver", "8765", "--noreload"])


if __name__ == "__main__":
    main()
