from django.urls import path

from . import calls, messaging, views

app_name = 'portal'

urlpatterns = [
    # The signed-in student's own portal
    path('me/', views.MyPortalView.as_view(), name='me'),
    path('me/goals/', views.MyGoalsView.as_view(), name='goals'),
    path('me/summary/', views.MySummaryView.as_view(), name='summary'),
    path('me/actions/', views.MyActionsView.as_view(), name='actions'),
    path('me/training/', views.MyTrainingView.as_view(), name='training'),
    path('me/training/<int:pk>/', views.MyTrainingView.as_view(), name='training_detail'),
    path('me/saved/', views.MySavedView.as_view(), name='saved'),
    path('me/saved/<slug:slug>/', views.MySavedView.as_view(), name='saved_detail'),
    path('me/applications/', views.MyApplicationsView.as_view(), name='applications'),
    path('me/applications/<int:pk>/', views.MyApplicationDetailView.as_view(), name='application_detail'),
    path('me/applications/<int:pk>/documents/', views.MyDocumentsView.as_view(), name='documents'),
    path('me/applications/<int:pk>/request-service/', views.MyServiceRequestView.as_view(), name='request_service'),
    path('me/applications/<int:pk>/service/accept-terms/', views.MyServiceTermsView.as_view(), name='accept_terms'),
    path('me/applications/<int:pk>/service/payment/', views.MyServicePaymentView.as_view(), name='payment'),
    path('me/documents/<int:pk>/file/', views.MyDocumentFileView.as_view(), name='document_file'),
    path('files/<str:kind>/<int:pk>/', views.PrivateFileView.as_view(), name='private_file'),
    path('me/documents/<int:pk>/', views.MyDocumentDetailView.as_view(), name='document_detail'),
    path('me/events/', views.MyEventView.as_view(), name='events'),

    # Administrators: any student's portal and the application tracker
    path('staff/students/<int:user_id>/', views.StudentPortalView.as_view(), name='staff_student'),
    path('staff/students/<int:user_id>/applications/', views.StaffApplicationsView.as_view(), name='staff_applications'),
    path('staff/students/<int:user_id>/notes/', views.StaffNotesView.as_view(), name='staff_notes'),
    path('staff/applications/', views.StaffApplicationBoardView.as_view(), name='staff_board'),
    path('staff/applications/overview/', views.StaffApplicationsOverviewView.as_view(), name='staff_applications_overview'),
    path('staff/scholarships/overview/', views.StaffScholarshipsOverviewView.as_view(), name='staff_scholarships_overview'),
    path('staff/applications/<int:pk>/', views.StaffApplicationDetailView.as_view(), name='staff_application'),
    path('staff/applications/<int:pk>/documents/', views.StaffDocumentsView.as_view(), name='staff_documents'),
    path('staff/applications/<int:pk>/service/', views.StaffServiceDecisionView.as_view(), name='staff_service'),
    path('staff/applications/<int:pk>/milestones/', views.StaffMilestonesView.as_view(), name='staff_milestones'),
    path('staff/applications/<int:pk>/milestones/reorder/', views.StaffMilestoneReorderView.as_view(), name='staff_milestone_reorder'),
    path('staff/milestones/<int:pk>/', views.StaffMilestoneDetailView.as_view(), name='staff_milestone'),
    path('staff/documents/<int:pk>/review/', views.StaffDocumentReviewView.as_view(), name='staff_document_review'),
    path('staff/applications/<int:pk>/result-files/', views.StaffResultFilesView.as_view(), name='staff_result_files'),
    path('staff/result-files/<int:pk>/', views.StaffResultFileDetailView.as_view(), name='staff_result_file'),
    path('staff/summary/', views.StaffSummaryView.as_view(), name='staff_summary'),
    # Messages between people and the ADRAM team
    path('me/messages/', messaging.MyMessagesView.as_view(), name='my_messages'),
    path('messages/unread/', messaging.UnreadMessagesView.as_view(), name='messages_unread'),
    path('messages/stats/', messaging.MessageStatsView.as_view(), name='messages_stats'),
    path('staff/conversations/', messaging.StaffConversationsView.as_view(), name='staff_conversations'),
    path('staff/conversations/<int:user_id>/', messaging.StaffConversationView.as_view(), name='staff_conversation'),
    path('staff/conversations/<int:user_id>/messages/<int:message_id>/', messaging.StaffMessageView.as_view(), name='staff_message'),
    # Voice and video calls
    path('calls/', calls.CallsView.as_view(), name='calls'),
    path('calls/config/', calls.CallConfigView.as_view(), name='call_config'),
    path('calls/incoming/', calls.IncomingCallsView.as_view(), name='calls_incoming'),
    path('calls/<int:pk>/', calls.CallDetailView.as_view(), name='call'),
    path('calls/<int:pk>/answer/', calls.AnswerCallView.as_view(), name='call_answer'),
    path('calls/<int:pk>/decline/', calls.DeclineCallView.as_view(), name='call_decline'),
    path('calls/<int:pk>/end/', calls.EndCallView.as_view(), name='call_end'),
    path('staff/insights/', views.StaffBusinessInsightsView.as_view(), name='staff_insights'),
    path('staff/students/<int:user_id>/training/', views.StaffTrainingView.as_view(), name='staff_training'),
    path('staff/training/', views.StaffTrainingListView.as_view(), name='staff_training_list'),
    path('staff/training/overview/', views.StaffTrainingOverviewView.as_view(), name='staff_training_overview'),
    path('staff/training/<int:pk>/', views.StaffTrainingDetailView.as_view(), name='staff_training_detail'),
    path('staff/payment-settings/', views.StaffPaymentSettingsView.as_view(), name='staff_payment_settings'),
    path('staff/documents/<int:pk>/', views.StaffDocumentDetailView.as_view(), name='staff_document'),
    path('staff/notes/<int:pk>/', views.StaffNoteDetailView.as_view(), name='staff_note'),
]
