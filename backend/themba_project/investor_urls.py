"""Serve the built React app alongside the Django API during local rehearsals."""

from django.conf import settings
from django.http import FileResponse, Http404
from django.urls import path, re_path
from django.views.static import serve

from .urls import urlpatterns as application_urls


BUILD = settings.BASE_DIR.parent / "frontend" / ".vite-local-build"


def preview_home(request):
    index = BUILD / "index.html"
    if not index.is_file():
        raise Http404("Start the preview with run-investor.ps1 Preview to build the web app.")
    return FileResponse(index.open("rb"), content_type="text/html")


urlpatterns = [
    path("", preview_home),
    re_path(r"^(?P<path>(?:assets|images)/.+)$", serve, {"document_root": BUILD}),
    *application_urls,
]
