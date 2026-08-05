import os
import certifi
from datetime import timedelta
from urllib.parse import quote_plus
from dotenv import load_dotenv
load_dotenv()

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY')
    DB_USER     = os.environ.get('DB_USER')
    DB_PASSWORD = quote_plus(os.environ.get('DB_PASSWORD', ''))
    DB_HOST     = os.environ.get('DB_HOST')
    DB_PORT     = os.environ.get('DB_PORT')
    DB_NAME     = os.environ.get('DB_NAME')
    SQLALCHEMY_DATABASE_URI = (
        f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # --- SSL obligatoire pour TiDB Cloud Serverless ---
    SQLALCHEMY_ENGINE_OPTIONS = {
        'connect_args': {
            'ssl': {'ca': certifi.where()}
        }
    }

    # --- JWT ---
    JWT_SECRET_KEY            = os.environ.get('JWT_SECRET_KEY')
    JWT_TOKEN_LOCATION        = ['headers', 'cookies']       
    JWT_ACCESS_TOKEN_EXPIRES  = timedelta(minutes=15)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=7)
    JWT_COOKIE_SECURE         = False
    JWT_COOKIE_CSRF_PROTECT   = True   
    JWT_ACCESS_COOKIE_PATH    = '/api/'
    JWT_REFRESH_COOKIE_PATH   = '/api/auth/refresh'
    JWT_COOKIE_SAMESITE       = 'Lax'
    GOOGLE_MAPS_API_KEY = os.environ.get('GOOGLE_MAPS_API_KEY')
    RATELIMIT_STORAGE_URL = os.environ.get('RATELIMIT_STORAGE_URL', 'memory://')

class DevelopmentConfig(Config):
    DEBUG = True

class ProductionConfig(Config):
    DEBUG                 = False
    JWT_COOKIE_SECURE     = True
    SESSION_COOKIE_SECURE = True