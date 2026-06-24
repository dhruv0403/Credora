from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from api.models import ActivityLog
from api.serializers import ActivityLogSerializer
from api.permissions import IsSpaceMember, ExcludesFieldMan

class ActivityTimelineView(generics.ListAPIView):
    serializer_class = ActivityLogSerializer
    permission_classes = [IsAuthenticated, IsSpaceMember, ExcludesFieldMan]

    def get_queryset(self):
        qs = ActivityLog.objects.filter(space=self.request.space).order_by('-created_at')
        
        e_type = self.request.query_params.get('entity_type')
        e_id = self.request.query_params.get('entity_id')
        if e_type and e_id:
            qs = qs.filter(entity_type=e_type, entity_id=e_id)
            
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from and date_to:
            qs = qs.filter(created_at__date__range=[date_from, date_to])
            
        return qs

