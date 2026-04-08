from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/erd/", include("django_erd.urls")),
    path("admin/", admin.site.urls),
]
