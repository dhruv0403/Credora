from rest_framework import generics
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from api.permissions import IsSpaceMember, ExcludesFieldMan

class ReportReceivableView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated, IsSpaceMember, ExcludesFieldMan]
    
    def get(self, request, space_id=None):
        return Response({"message": "Receivable report placeholder."})

class ReportPayableView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated, IsSpaceMember, ExcludesFieldMan]
    
    def get(self, request, space_id=None):
        return Response({"message": "Payable report placeholder."})

class ReportInterestView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated, IsSpaceMember, ExcludesFieldMan]
    
    def get(self, request, space_id=None):
        return Response({"message": "Interest report placeholder."})

class ReportOverdueView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated, IsSpaceMember, ExcludesFieldMan]
    
    def get(self, request, space_id=None):
        return Response({"message": "Overdue report placeholder."})

class ReportCashFlowView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated, IsSpaceMember, ExcludesFieldMan]
    
    def get(self, request, space_id=None):
        return Response({"message": "Cash flow report placeholder."})

