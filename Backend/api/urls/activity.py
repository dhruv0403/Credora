from django.urls import path
from api.views import ActivityTimelineView

activity_urls = [
    path('spaces/<int:space_id>/activity/', ActivityTimelineView.as_view(), name='activity_timeline'),
]

