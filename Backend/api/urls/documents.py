from django.urls import path
from api.views import DocumentViewSet

document_urls = [
    path('spaces/<int:space_id>/documents/', DocumentViewSet.as_view({'get': 'list', 'post': 'create'}), name='documents'),
    path('spaces/<int:space_id>/documents/<int:pk>/', DocumentViewSet.as_view({'delete': 'destroy'}), name='document_detail'),
]

