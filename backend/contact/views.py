from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.core.mail import send_mail
from django.conf import settings
from accounts.permissions import IsAdmin
from .models import ContactMessage
from .serializers import ContactMessageSerializer

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
        
        # Send email notification to admin
        try:
            subject = f"New Contact Form Submission: {contact_message.subject}"
            message = f"""
New Contact Form Submission

Name: {contact_message.name}
Email: {contact_message.email}
Subject: {contact_message.subject}

Message:
{contact_message.message}

---
This message was sent from the ADRAM Technologies contact form.
            """
            
            # Send to admin email
            send_mail(
                subject,
                message,
                settings.DEFAULT_FROM_EMAIL,
                [settings.CONTACT_NOTIFY_EMAIL],
                fail_silently=True,
            )
            
            # Send confirmation email to user
            user_subject = "We received your message"
            user_message = f"""
Hi {contact_message.name},

Thank you for contacting ADRAM Technologies. We have received your message and will get back to you as soon as possible.

Your Message:
Subject: {contact_message.subject}
Message: {contact_message.message}

Best regards,
ADRAM Technologies Team
            """
            
            send_mail(
                user_subject,
                user_message,
                settings.DEFAULT_FROM_EMAIL,
                [contact_message.email],
                fail_silently=True,
            )
            
        except Exception as e:
            print(f"Error sending email: {str(e)}")
        
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
    serializer_class = ContactMessageSerializer
    permission_classes = [IsAdmin]
