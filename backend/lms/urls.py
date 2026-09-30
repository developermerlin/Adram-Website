from django.urls import path

from . import administration, builder, commerce, community, discovery, instructor, views

app_name = 'lms'

urlpatterns = [
    # Finding courses
    path('catalog/', discovery.CatalogView.as_view(), name='catalog'),
    path('catalog/facets/', discovery.FacetsView.as_view(), name='facets'),
    path('catalog/home/', discovery.HomeRowsView.as_view(), name='catalog_home'),
    path('categories/', administration.PublicCategoriesView.as_view(), name='categories'),
    path('instructors/<int:pk>/', discovery.InstructorProfileView.as_view(), name='instructor_profile'),

    # Students and visitors: a course and its lessons
    path('courses/<slug:slug>/', views.CourseOutlineView.as_view(), name='outline'),
    path('courses/<slug:slug>/view/', discovery.CourseViewedView.as_view(), name='course_viewed'),
    path('courses/<slug:slug>/related/', discovery.RelatedView.as_view(), name='related'),
    path('courses/<slug:slug>/certificate/', views.CertificateView.as_view(), name='certificate'),
    path('courses/<slug:slug>/reviews/', views.ReviewsView.as_view(), name='reviews'),
    path('courses/<slug:slug>/notes/', views.CourseNotesView.as_view(), name='course_notes'),
    path('lessons/<int:pk>/', views.LessonView.as_view(), name='lesson'),
    path('lessons/<int:pk>/progress/', views.LessonProgressView.as_view(), name='progress'),
    path('lessons/<int:pk>/quiz/start/', views.QuizStartView.as_view(), name='quiz_start'),
    path('lessons/<int:pk>/quiz/', views.QuizSubmitView.as_view(), name='quiz'),
    path('lessons/<int:pk>/submissions/', views.SubmissionsView.as_view(), name='submissions'),
    path('lessons/<int:pk>/notes/', views.LessonNotesView.as_view(), name='lesson_notes'),
    path('notes/<int:pk>/', views.NoteDetailView.as_view(), name='note'),
    path('certificates/<str:code>/', views.VerifyCertificateView.as_view(), name='verify'),
    path('media/<str:kind>/<int:pk>/', views.MediaView.as_view(), name='media'),

    # The signed-in person
    path('me/', views.MyLearningView.as_view(), name='me'),
    path('me/dashboard/', discovery.StudentDashboardView.as_view(), name='dashboard'),
    path('me/library/', discovery.LibraryView.as_view(), name='library'),
    path('me/certificates/', views.MyCertificatesView.as_view(), name='my_certificates'),
    path('me/profile/', discovery.MyProfileView.as_view(), name='my_profile'),
    path('me/notifications/', discovery.NotificationsView.as_view(), name='notifications'),
    path('me/notifications/read/', discovery.NotificationsReadView.as_view(), name='notifications_read'),
    path('reports/', administration.ReportCreateView.as_view(), name='report'),

    # Cart, orders and payments
    path('cart/', commerce.CartView.as_view(), name='cart'),
    path('cart/checkout/', commerce.CartCheckoutView.as_view(), name='cart_checkout'),
    path('cart/<slug:slug>/', commerce.CartItemView.as_view(), name='cart_item'),
    path('courses/<slug:slug>/buy/', commerce.BuyNowView.as_view(), name='buy'),
    path('me/orders/', commerce.MyOrdersView.as_view(), name='my_orders'),
    path('orders/<int:pk>/', commerce.OrderView.as_view(), name='order'),
    path('orders/<int:pk>/payment/', commerce.OrderPaymentView.as_view(), name='order_payment'),
    path('orders/<int:pk>/cancel/', commerce.OrderCancelView.as_view(), name='order_cancel'),
    path('orders/<int:pk>/receipt/', commerce.OrderReceiptView.as_view(), name='order_receipt'),

    # Wishlist, announcements and Q&A
    path('me/wishlist/', community.WishlistView.as_view(), name='wishlist'),
    path('courses/<slug:slug>/wishlist/', community.CourseWishlistView.as_view(), name='course_wishlist'),
    path('courses/<slug:slug>/announcements/', community.AnnouncementsView.as_view(), name='announcements'),
    path('courses/<slug:slug>/qa/', community.QuestionsView.as_view(), name='qa'),
    path('qa/<int:pk>/', community.ThreadView.as_view(), name='thread'),
    path('qa/<int:pk>/replies/', community.RepliesView.as_view(), name='replies'),
    path('qa/replies/<int:pk>/', community.ReplyDetailView.as_view(), name='reply'),
    path('qa/replies/<int:pk>/like/', community.ReplyLikeView.as_view(), name='reply_like'),
    path('qa/replies/<int:pk>/mark/', community.ReplyMarkView.as_view(), name='reply_mark'),
    path('manage/courses/<slug:slug>/announcements/', community.ManageAnnouncementsView.as_view(), name='manage_announcements'),
    path('manage/announcements/<int:pk>/', community.AnnouncementDetailView.as_view(), name='announcement'),

    # Instructors (and administrators)
    path('instructor/dashboard/', instructor.DashboardView.as_view(), name='instructor_dashboard'),
    path('instructor/courses/', instructor.CoursesView.as_view(), name='instructor_courses'),
    path('instructor/courses/<slug:slug>/', instructor.CourseDetailView.as_view(), name='instructor_course'),
    path('instructor/courses/<slug:slug>/submit/', instructor.SubmitView.as_view(), name='instructor_submit'),
    path('instructor/courses/<slug:slug>/publish/', instructor.PublishView.as_view(), name='instructor_publish'),
    path('instructor/analytics/', instructor.AnalyticsView.as_view(), name='instructor_analytics'),
    path('instructor/earnings/', instructor.EarningsView.as_view(), name='instructor_earnings'),
    path('instructor/questions/', instructor.QuestionsView.as_view(), name='instructor_questions'),
    path('instructor/reviews/', instructor.ReviewsView.as_view(), name='instructor_reviews'),

    # Building a curriculum (the course's instructor, or administrators)
    path('manage/courses/<slug:slug>/curriculum/', builder.CurriculumView.as_view(), name='curriculum'),
    path('manage/courses/<slug:slug>/sections/', builder.SectionsView.as_view(), name='sections'),
    path('manage/courses/<slug:slug>/reorder/', builder.ReorderView.as_view(), name='reorder'),
    path('manage/courses/<slug:slug>/students/', builder.StudentsView.as_view(), name='students'),
    path('manage/courses/<slug:slug>/submissions/', builder.CourseSubmissionsView.as_view(), name='course_submissions'),
    path('manage/submissions/<int:pk>/grade/', builder.GradeSubmissionView.as_view(), name='grade'),
    path('manage/sections/<int:pk>/', builder.SectionDetailView.as_view(), name='section'),
    path('manage/sections/<int:pk>/lessons/', builder.LessonsView.as_view(), name='lessons'),
    path('manage/lessons/<int:pk>/', builder.LessonDetailView.as_view(), name='manage_lesson'),
    path('manage/lessons/<int:pk>/resources/', builder.ResourcesView.as_view(), name='resources'),
    path('manage/lessons/<int:pk>/quiz/', builder.QuizView.as_view(), name='manage_quiz'),
    path('manage/resources/<int:pk>/', builder.ResourceDetailView.as_view(), name='resource'),
    path('manage/lessons/<int:pk>/resources/order/', builder.ResourceOrderView.as_view(), name='resource_order'),
    path('admin/users/<int:pk>/', administration.EditUserView.as_view(), name='admin_edit_user'),
    path('admin/notify/', administration.BroadcastView.as_view(), name='admin_notify'),

    # Administrators: sales
    path('manage/orders/', commerce.ManageOrdersView.as_view(), name='manage_orders'),
    path('manage/orders/<int:pk>/', commerce.ManageOrderView.as_view(), name='manage_order'),
    path('manage/orders/<int:pk>/decision/', commerce.OrderDecisionView.as_view(), name='order_decision'),
    path('manage/orders/<int:pk>/refund/', commerce.OrderRefundView.as_view(), name='order_refund'),
    path('manage/coupons/', commerce.CouponsView.as_view(), name='coupons'),
    path('manage/coupons/<int:pk>/', commerce.CouponDetailView.as_view(), name='coupon'),
    path('manage/settings/', commerce.LmsSettingsView.as_view(), name='settings'),
    path('manage/earnings/', commerce.ManageEarningsView.as_view(), name='manage_earnings'),
    path('manage/payouts/', commerce.PayoutsView.as_view(), name='payouts'),

    # Administrators: running the platform
    path('admin/dashboard/', administration.DashboardView.as_view(), name='admin_dashboard'),
    path('admin/courses/', administration.CourseQueueView.as_view(), name='admin_courses'),
    path('admin/courses/<slug:slug>/review/', administration.CourseReviewView.as_view(), name='admin_course_review'),
    path('admin/categories/', administration.CategoriesView.as_view(), name='admin_categories'),
    path('admin/categories/<int:pk>/', administration.CategoryDetailView.as_view(), name='admin_category'),
    path('admin/reviews/', administration.ReviewModerationView.as_view(), name='admin_reviews'),
    path('admin/reviews/<int:pk>/', administration.ReviewModerateView.as_view(), name='admin_review'),
    path('admin/reports/', administration.ReportsView.as_view(), name='admin_reports'),
    path('admin/reports/<int:pk>/', administration.ReportDecisionView.as_view(), name='admin_report'),
    path('admin/certificates/', administration.CertificatesView.as_view(), name='admin_certificates'),
    path('admin/certificates/<str:code>/', administration.CertificateActionView.as_view(), name='admin_certificate'),
    path('admin/audit/', administration.AuditLogView.as_view(), name='admin_audit'),
    path('admin/users/', administration.CreateUserView.as_view(), name='admin_create_user'),
    path('admin/users/<int:pk>/learning/', administration.UserLearningView.as_view(), name='admin_user_learning'),
    path('admin/users/<int:pk>/enroll/', administration.GrantEnrollmentView.as_view(), name='admin_grant'),
]
