from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
import logging

from accounts.emails import send_contact_confirmation, send_contact_notification
from accounts.permissions import IsAdmin
from .models import ContactMessage
from .serializers import ContactMessageSerializer, ContactMessageAdminSerializer

logger = logging.getLogger(__name__)

@api_view(['POST'])
@permission_classes([AllowAny])
def create_contact_message(request):
    """
    Create a new contact message and send notification email
    """
    serializer = ContactMessageSerializer(data=request.data)
    
    if serializer.is_valid():
        # Save the message
        contact_message = serializer.save()
        
        # Branded emails: an alert to the team (Reply-To is the sender) and a confirmation to the sender.
        # A failed email must never lose the enquiry, which is already saved.
        for send in (send_contact_notification, send_contact_confirmation):
            try:
                send(contact_message)
            except Exception:
                logger.exception('Could not send contact email (%s) for message %s', send.__name__, contact_message.pk)

        return Response(
            {
                'success': True,
                'message': 'Your message has been sent successfully. We will contact you soon.',
                'data': serializer.data
            },
            status=status.HTTP_201_CREATED
        )
    
    return Response(
        {
            'success': False,
            'message': 'Error sending message',
            'errors': serializer.errors
        },
        status=status.HTTP_400_BAD_REQUEST
    )


class ContactMessageViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing contact messages (admin only).
    Public submissions go through create_contact_message instead.
    """
    queryset = ContactMessage.objects.all()
    serializer_class = ContactMessageAdminSerializer
    permission_classes = [IsAdmin]
    # Admins read, mark read/unread and delete; new messages only arrive through the public form.
    http_method_names = ['get', 'patch', 'delete', 'head', 'options']
    search_fields = ['name', 'email', 'subject', 'message']

    def get_queryset(self):
        """?is_read=true|false filters the inbox."""
        queryset = super().get_queryset()
        is_read = self.request.query_params.get('is_read')
        if is_read in ('true', 'false'):
            queryset = queryset.filter(is_read=is_read == 'true')
        return queryset
