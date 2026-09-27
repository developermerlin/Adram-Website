export const SectionTitle = ({ eyebrow, title }) => {
  return (
    <div className="row justify-content-sm-center">
      <div className="cl-xl-7 col-lg-8 col-md-10">
        <div className="section-tittle text-center mb-70">
          {eyebrow && <span>{eyebrow}</span>}
          <h2>{title}</h2>
        </div>
      </div>
    </div>
  );
};

export default SectionTitle;
