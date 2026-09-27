import { useParams } from 'react-router-dom';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/common/Layout';
import PageBanner from '../components/common/PageBanner';
import '../styles/pages/blog-details.css';

export const BlogDetailsPage = () => {
  const { id } = useParams();
  const [comments, setComments] = useState([
    { id: 1, author: 'John Doe', date: '2024-01-15', text: 'Great article! Very informative and well-written.' },
    { id: 2, author: 'Jane Smith', date: '2024-01-16', text: 'This really helped me understand the topic better. Thanks!' },
    { id: 3, author: 'Mike Wilson', date: '2024-01-17', text: 'Excellent insights. I will implement these recommendations.' },
  ]);

  const [newComment, setNewComment] = useState({ name: '', email: '', text: '' });

  const article = {
    title: 'The Future of Online Education',
    image: '/assets/img/blog/single_blog_1.png',
    date: '2024-01-15',
    category: 'Technology',
    author: 'John Smith',
    authorBio: 'John is a passionate educator with over 10 years of experience in online learning.',
    authorImage: '/assets/img/blog/author.png',
  };

  const handleCommentSubmit = (e) => {
    e.preventDefault();
    if (newComment.text && newComment.name) {
      setComments([...comments, {
        id: comments.length + 1,
        author: newComment.name,
        date: new Date().toLocaleDateString(),
        text: newComment.text
      }]);
      setNewComment({ name: '', email: '', text: '' });
    }
  };

  return (
    <Layout>
      <PageBanner title="Blog Details" />

      {/* Blog Details */}
      <div className="blog-details section-padding30">
        <div className="container">
          <div className="row">
            <div className="col-lg-8">
              {/* Featured Image */}
              <div className="blog-details-img mb-50">
                <img src={article.image} alt={article.title} style={{ width: '100%', borderRadius: '8px' }} />
              </div>

              {/* Article Meta */}
              <div className="blog-details-content">
                <h2 style={{ marginBottom: '20px' }}>{article.title}</h2>
                <ul className="blog-meta" style={{ marginBottom: '30px', listStyle: 'none', padding: 0, display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                  <li><i className="fas fa-folder-open"></i> {article.category}</li>
                  <li><i className="fas fa-comments"></i> {comments.length} Comments</li>
                  <li><i className="fas fa-user"></i> By {article.author}</li>
                  <li><i className="fas fa-calendar"></i> {article.date}</li>
                </ul>

                {/* Article Content */}
                <div style={{ lineHeight: '1.8', color: '#555', marginBottom: '40px' }}>
                  <h3>Introduction</h3>
                  <p>Online education has transformed dramatically over the past decade. The integration of artificial intelligence, virtual reality, and personalized learning paths has created unprecedented opportunities for learners worldwide.</p>
                  
                  <h3>Key Trends</h3>
                  <p>The landscape of online learning continues to evolve at a rapid pace. From adaptive learning systems to immersive VR classrooms, educational institutions are increasingly investing in these technologies to provide more engaging learning experiences.</p>
                  
                  <blockquote style={{ borderLeft: '4px solid #3498db', paddingLeft: '20px', margin: '30px 0', fontStyle: 'italic', color: '#666' }}>
                    "Education is not the filling of a pail, but the lighting of a fire." - William Butler Yeats
                  </blockquote>
                  
                  <h3>Personalization at Scale</h3>
                  <p>One of the most significant advancements is the ability to personalize learning at scale. Machine learning algorithms can analyze individual learning patterns and recommend customized content and teaching methods.</p>
                  
                  <h3>Conclusion</h3>
                  <p>The future of online education is bright. As technology advances, we can expect more innovative approaches while maintaining a focus on meaningful learning outcomes.</p>
                </div>

                {/* Author Bio */}
                <div style={{ padding: '30px', background: '#f8f9fa', borderRadius: '8px', marginBottom: '40px', display: 'flex', gap: '20px' }}>
                  <img src={article.authorImage} alt={article.author} style={{ width: '100px', height: '100px', borderRadius: '8px', objectFit: 'cover' }} />
                  <div>
                    <h4 style={{ marginBottom: '8px' }}>{article.author}</h4>
                    <p style={{ color: '#666', marginBottom: '0' }}>{article.authorBio}</p>
                  </div>
                </div>

                {/* Comments Section */}
                <div style={{ marginBottom: '40px' }}>
                  <h4 style={{ marginBottom: '30px' }}>{comments.length} Comments</h4>
                  {comments.map((comment) => (
                    <div key={comment.id} style={{ marginBottom: '30px', paddingLeft: '20px', borderLeft: '3px solid #3498db' }}>
                      <h5 style={{ marginBottom: '3px' }}>{comment.author}</h5>
                      <span style={{ color: '#999', fontSize: '0.9rem' }}>{comment.date}</span>
                      <p style={{ color: '#666', marginBottom: '10px', marginTop: '8px' }}>{comment.text}</p>
                      <a href="#" style={{ color: '#3498db', fontSize: '0.9rem', textDecoration: 'none' }}>Reply</a>
                    </div>
                  ))}
                </div>

                {/* Comment Form */}
                <div>
                  <h4 style={{ marginBottom: '30px' }}>Leave a Reply</h4>
                  <form onSubmit={handleCommentSubmit}>
                    <div className="form-group" style={{ marginBottom: '20px' }}>
                      <textarea
                        placeholder="Write your comment here..."
                        rows="5"
                        value={newComment.text}
                        onChange={(e) => setNewComment({ ...newComment, text: e.target.value })}
                        style={{ width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '4px', fontFamily: 'inherit' }}
                        required
                      ></textarea>
                    </div>
                    <div className="row" style={{ marginBottom: '20px' }}>
                      <div className="col-md-6" style={{ marginBottom: '15px', paddingRight: '10px' }}>
                        <input
                          type="text"
                          placeholder="Your Name"
                          value={newComment.name}
                          onChange={(e) => setNewComment({ ...newComment, name: e.target.value })}
                          style={{ width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }}
                          required
                        />
                      </div>
                      <div className="col-md-6" style={{ paddingLeft: '10px' }}>
                        <input
                          type="email"
                          placeholder="Your Email"
                          value={newComment.email}
                          onChange={(e) => setNewComment({ ...newComment, email: e.target.value })}
                          style={{ width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }}
                          required
                        />
                      </div>
                    </div>
                    <button type="submit" className="btn" style={{ backgroundColor: '#3498db', color: 'white', padding: '12px 30px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                      Post Comment
                    </button>
                  </form>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="col-lg-4">
              <aside style={{ padding: '20px', background: '#f8f9fa', borderRadius: '8px' }}>
                <h5 style={{ marginBottom: '15px' }}>Related Posts</h5>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  <li style={{ marginBottom: '12px' }}><Link to="/blog/2" style={{ color: '#3498db', textDecoration: 'none' }}>Web Development Trends in 2024</Link></li>
                  <li style={{ marginBottom: '12px' }}><Link to="/blog/3" style={{ color: '#3498db', textDecoration: 'none' }}>Digital Marketing Best Practices</Link></li>
                  <li><Link to="/blog/4" style={{ color: '#3498db', textDecoration: 'none' }}>Artificial Intelligence in Education</Link></li>
                </ul>
              </aside>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default BlogDetailsPage;
