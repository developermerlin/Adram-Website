"""
Adds training programmes so that every ADRAM service has a matching track (touch typing, networking,
hardware, data analytics, graphic design, IT consultancy and digital transformation). Each starts published; the admin portal can edit, reorder or hide them,
and add the duration, fee and next intake, which are left blank so people are asked to enquire.
"""
from django.db import migrations

COURSES = [
    {
        'slug': 'touch-typing',
        'title': 'Touch Typing',
        'icon': 'laptop',
        'summary': 'Learn to type fast and accurately without looking at the keyboard, from your first lesson to a speed test.',
        'topics': ['Finger placement', 'Speed & accuracy drills', 'Progress tests', 'Certificate'],
        'sort_order': 5,
    },
    {
        'slug': 'computer-networking',
        'title': 'Computer Networking',
        'icon': 'network',
        'summary': 'Plan, install and troubleshoot office networks, from cabling and Wi-Fi to routers and security.',
        'topics': ['Cabling & Wi-Fi', 'Routers & switches', 'Network security'],
        'sort_order': 70,
    },
    {
        'slug': 'computer-hardware',
        'title': 'Computer Hardware & Repair',
        'icon': 'build',
        'summary': 'Diagnose faults, repair and upgrade laptops and desktops, and keep equipment running.',
        'topics': ['Diagnostics', 'Repairs & upgrades', 'Servicing'],
        'sort_order': 80,
    },
    {
        'slug': 'data-analytics',
        'title': 'Data Analytics',
        'icon': 'growth',
        'summary': 'Collect, clean and analyse data, then present it in dashboards and reports people can act on.',
        'topics': ['Spreadsheets & SQL', 'Data cleaning', 'Dashboards & reports'],
        'sort_order': 90,
    },
    {
        'slug': 'graphic-design',
        'title': 'Graphic Design & Photography',
        'icon': 'design',
        'summary': 'Create logos, flyers and social media graphics, and take and edit professional photographs.',
        'topics': ['Logo & branding', 'Print & social design', 'Photography & editing'],
        'sort_order': 100,
    },
    {
        'slug': 'it-consultancy',
        'title': 'IT Consultancy & Project Management',
        'icon': 'consult',
        'summary': 'Learn to assess technology needs, plan and oversee IT projects, and give clear, independent advice.',
        'topics': ['IT assessments', 'Procurement & vendors', 'Project oversight'],
        'sort_order': 110,
    },
    {
        'slug': 'digital-transformation',
        'title': 'Digital Transformation',
        'icon': 'transform',
        'summary': 'Move an organisation from paper to digital: process mapping, cloud tools and leading staff through change.',
        'topics': ['Process digitisation', 'Cloud & collaboration tools', 'Change management'],
        'sort_order': 120,
    },
]


def load(apps, schema_editor):
    Course = apps.get_model('catalog', 'Course')
    for row in COURSES:
        Course.objects.get_or_create(slug=row['slug'], defaults={**row, 'is_published': True})


def unload(apps, schema_editor):
    apps.get_model('catalog', 'Course').objects.filter(slug__in=[r['slug'] for r in COURSES]).delete()


class Migration(migrations.Migration):
    dependencies = [('catalog', '0004_timeline_and_service')]
    operations = [migrations.RunPython(load, unload)]
