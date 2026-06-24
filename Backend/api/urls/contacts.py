from django.urls import path
from api.views import ContactViewSet

contact_urls = [
    path('spaces/<int:space_id>/contacts/', ContactViewSet.as_view({'get': 'list', 'post': 'create'}), name='contacts'),
    path('spaces/<int:space_id>/contacts/<int:pk>/', ContactViewSet.as_view({'get': 'retrieve', 'patch': 'partial_update', 'delete': 'destroy'}), name='contact_detail'),
    path('spaces/<int:space_id>/contacts/<int:pk>/loans/', ContactViewSet.as_view({'get': 'loans'}), name='contact_loans'),
]

