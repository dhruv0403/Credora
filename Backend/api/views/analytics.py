from rest_framework import generics
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from api.permissions import IsSpaceMember, ExcludesFieldMan

class AnalyticsNetPositionView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated, IsSpaceMember, ExcludesFieldMan]
    
    def get(self, request, space_id=None):
        return Response({"message": "Net position analytics placeholder."})

class AnalyticsTopContactsView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated, IsSpaceMember, ExcludesFieldMan]
    
    def get(self, request, space_id=None):
        return Response({"message": "Top contacts analytics placeholder."})

class AnalyticsLoanRankingsView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated, IsSpaceMember, ExcludesFieldMan]
    
    def get(self, request, space_id=None):
        return Response({"message": "Loan rankings analytics placeholder."})

class AnalyticsTrendsView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated, IsSpaceMember, ExcludesFieldMan]
    
    def get(self, request, space_id=None):
        return Response({"message": "Trends analytics placeholder."})

