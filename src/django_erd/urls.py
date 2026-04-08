from django.urls import path

from django_erd import views

app_name = "django_erd"

urlpatterns = [
    path("", views.index, name="index"),
    path("<int:component_id>/", views.erd_detail, name="detail"),
    # Static assets served as views to avoid collectstatic requirement during dev
    path("static/style.css", views.serve_css, name="css"),
    path("static/erd.js", views.serve_js, name="js"),
]
