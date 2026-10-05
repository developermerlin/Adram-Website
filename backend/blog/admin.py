from django.contrib import admin

from .models import Category, Post


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'sort_order')
    prepopulated_fields = {'slug': ('name',)}


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ('title', 'status', 'category', 'published_at', 'featured', 'views')
    list_filter = ('status', 'category', 'featured')
    search_fields = ('title', 'excerpt', 'body')
