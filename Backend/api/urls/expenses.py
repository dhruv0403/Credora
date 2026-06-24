from django.urls import path
from api.views import ExpenseViewSet

expense_urls = [
    path('spaces/<int:space_id>/expenses/', ExpenseViewSet.as_view({'get': 'list', 'post': 'create'}), name='expenses'),
    path('spaces/<int:space_id>/expenses/<int:pk>/', ExpenseViewSet.as_view({'get': 'retrieve', 'patch': 'partial_update', 'delete': 'destroy'}), name='expense_detail'),
]

