import { useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/common/Layout';
import PageBanner from '../components/common/PageBanner';
import '../styles/pages/blog.css';

export const BlogPage = () => {
  const [currentPage, setCurrentPage] = useState(1);

  const blogPosts = [
    { id: 1, title: 'The Future of Online Education', image: '/assets/img/blog/single_blog_1.png', excerpt: 'Exploring how technology is transforming the landscape of online learning and making education more accessible worldwide.', category: 'Technology', date: '2024-01-15', author: 'John Smith', comments: 5 },
    { id: 2, title: 'Web Development Trends in 2024', image: '/assets/img/blog/single_blog_2.png', excerpt: 'Discover the latest trends and technologies shaping the web development industry this year.', category: 'Development', date: '2024-01-12', author: 'Sarah Johnson', comments: 8 },
    { id: 3, title: 'Digital Marketing Best Practices', image: '/assets/img/blog/single_blog_3.png', excerpt: 'Learn proven strategies to enhance your digital marketing campaigns and reach your target audience effectively.', category: 'Marketing', date: '2024-01-10', author: 'Mike Brown', comments: 3 },
    { id: 4, title: 'Artificial Intelligence in Education', image: '/assets/img/blog/single_blog_4.png', excerpt: 'How AI is revolutionizing personalized learning and creating better educational outcomes for students.', category: 'AI', date: '2024-01-08', author: 'Emily Davis', comments: 12 },
    { id: 5, title: 'Mobile App Development Guide', image: '/assets/img/blog/single_blog_5.png', excerpt: 'A comprehensive guide to getting started with mobile app development in 2024.', category: 'Development', date: '2024-01-05', author: 'Alex Wilson', comments: 7 },
  ];

  const categories = [
    { name: 'Technology', count: 23 },
    { name: 'Development', count: 18 },
    { name: 'Education', count: 15 },
    { name: 'Marketing', count: 12 },
    { name: 'AI & ML', count: 10 },
  ];

  const recentPosts = blogPosts.slice(0, 3);

  const postsPerPage = 3;
  const startIdx = (currentPage - 1) * postsPerPage;
  const paginatedPosts = blogPosts.slice(startIdx, startIdx + postsPerPage);
  const totalPages = Math.ceil(blogPosts.length / postsPerPage);

  return (
    <Layout>
      <PageBanner title="Our Blog" />

      {/* Blog Section */}
      <div className="blog-area section-padding30">
        <div className="container">
          <div className="row">
            <div className="col-lg-8">
              {/* Blog Posts */}
              {paginatedPosts.map((post) => (
                <div key={post.id} className="single-blog mb-30">
                  <div className="blog-img">
                    <img src={post.image} alt={post.title} />
                  </div>
                  <div className="blog-content">
                    <div className="blog-date">
                      <span>{new Date(post.date).getDate()}</span>
                      <p>{new Date(post.date).toLocaleDateString('en-US', { month: 'short' })}</p>
                    </div>
                    <h4><Link to={`/blog/${post.id}`}>{post.title}</Link></h4>
                    <ul className="blog-meta">
                      <li><a href="#"><i className="fas fa-folder-open"></i> {post.category}</a></li>
                      <li><i className="fas fa-comments"></i> {post.comments} Comments</li>
                    </ul>
                    <p>{post.excerpt}</p>
                    <Link to={`/blog/${post.id}`} className="read-more">Read More →</Link>
                  </div>
                </div>
              ))}

              {/* Pagination */}
              <nav className="pagination-nav">
                <ul className="pagination">
                  {currentPage > 1 && (
                    <li><button onClick={() => setCurrentPage(currentPage - 1)} className="prev">← Previous</button></li>
                  )}
                  {[...Array(totalPages)].map((_, idx) => (
                    <li key={idx + 1} className={currentPage === idx + 1 ? 'active' : ''}>
                      <button onClick={() => setCurrentPage(idx + 1)}>{idx + 1}</button>
                    </li>
                  ))}
                  {currentPage < totalPages && (
                    <li><button onClick={() => setCurrentPage(currentPage + 1)} className="next">Next →</button></li>
                  )}
                </ul>
              </nav>
            </div>

            {/* Sidebar */}
            <div className="col-lg-4">
              {/* Search Widget */}
              <aside className="sidebar-wrapper mb-40">
                <div className="widget-title mb-30">
                  <h5>Search</h5>
                </div>
                <form className="search-form">
                  <input type="text" placeholder="Search here..." />
                  <button type="submit"><i className="fas fa-search"></i></button>
                </form>
              </aside>

              {/* Category Widget */}
              <aside className="sidebar-wrapper mb-40">
                <div className="widget-title mb-30">
                  <h5>Categories</h5>
                </div>
                <ul className="category-list">
                  {categories.map((cat, idx) => (
                    <li key={idx}>
                      <a href="#"><span>{cat.name}</span> <span>({cat.count})</span></a>
                    </li>
                  ))}
                </ul>
              </aside>

              {/* Recent Posts Widget */}
              <aside className="sidebar-wrapper mb-40">
                <div className="widget-title mb-30">
                  <h5>Recent Posts</h5>
                </div>
                <ul className="recent-post-list">
                  {recentPosts.map((post) => (
                    <li key={post.id} className="recent-post-item">
                      <img src={post.image} alt={post.title} />
                      <div className="recent-post-content">
                        <Link to={`/blog/${post.id}`}>{post.title}</Link>
                        <p className="date">{new Date(post.date).toLocaleDateString()}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </aside>

              {/* Tags Widget */}
              <aside className="sidebar-wrapper mb-40">
                <div className="widget-title mb-30">
                  <h5>Tags</h5>
                </div>
                <div className="tag-list">
                  {['Technology', 'Learning', 'Web Design', 'Development', 'Tutorial', 'Tips'].map((tag, idx) => (
                    <a key={idx} href="#" className="tag-item">{tag}</a>
                  ))}
                </div>
              </aside>

              {/* Newsletter Widget */}
              <aside className="sidebar-wrapper">
                <div className="widget-title mb-30">
                  <h5>Newsletter</h5>
                </div>
                <form className="newsletter-form">
                  <input type="email" placeholder="Your email address" />
                  <button type="submit" className="btn btn-sm">Subscribe</button>
                </form>
              </aside>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default BlogPage;
