const DEFAULT_STATS = [
  { icon: 'fas fa-book', value: '1050', label: '+ Topics', valueClass: 'color-green', iconColor: '#3498db' },
  { icon: 'fas fa-users', value: '5000', label: '+ Students', valueClass: 'color-blue', iconColor: '#2ecc71' },
  { icon: 'fas fa-graduation-cap', value: '500', label: '+ Courses', valueClass: 'color-green', iconColor: '#e74c3c' },
  { icon: 'fas fa-chalkboard-teacher', value: '150', label: '+ Instructors', valueClass: 'color-red', iconColor: '#f39c12' },
];

export const StatsBar = ({ stats = DEFAULT_STATS }) => {
  return (
    <div
      className="count-down-area pt-90 pb-60 section-bg"
      style={{ backgroundImage: 'url(/assets/img/gallery/section_bg01.png)' }}
    >
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-lg-12 col-md-12">
            <div className="count-down-wrapper">
              <div className="row justify-content-between">
                {stats.map((stat) => (
                  <div key={stat.label} className="col-lg-3 col-md-6 col-sm-6">
                    <div className="single-counter text-center">
                      <i className={stat.icon} style={{ fontSize: '48px', color: stat.iconColor, marginBottom: '20px' }} />
                      <span className={`counter ${stat.valueClass}`}>{stat.value}</span>
                      <p className={stat.valueClass}>{stat.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsBar;
