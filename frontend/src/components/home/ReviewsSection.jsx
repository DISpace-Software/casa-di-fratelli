import React from "react";
import { googleReviewLink } from "../../data/googleReviewConfig";

const tripadvisorReviewLink =
  "https://www.tripadvisor.com/Restaurant_Review-g295391-d34311639-Reviews-Casa_di_Fratelli-Plovdiv_Plovdiv_Province.html";

function Stars({ rating }) {
  return (
    <div className="flex gap-1 text-amber-300">
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index}>{index < rating ? "★" : "☆"}</span>
      ))}
    </div>
  );
}

// 👉 демо-отзывы (можешь потом заменить на реальные)
const demoReviews = [
  {
    reviewId: "1",
    reviewer: { displayName: "Ivan Petrov" },
    starRating: 5,
    comment: "Amazing atmosphere and authentic Italian food!",
    relativeTimeDescription: "2 days ago",
  },
  {
    reviewId: "2",
    reviewer: { displayName: "Maria Ivanova" },
    starRating: 5,
    comment: "Best pasta in Plovdiv. Highly recommended!",
    relativeTimeDescription: "1 week ago",
  },
  {
    reviewId: "3",
    reviewer: { displayName: "George Dimitrov" },
    starRating: 4,
    comment: "Great service and cozy place.",
    relativeTimeDescription: "3 days ago",
  },
];

export default function ReviewsSection({ language }) {
  const [reviews, setReviews] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    // 👉 вместо API просто ставим демо данные
    setReviews(demoReviews);
    setLoading(false);
  }, []);

  return (
    <section id="reviews" className="reviews-section mx-auto max-w-7xl px-6 py-20">
      <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-amber-300">
            {language === "bg" ? "Отзиви" : "Reviews"}
          </p>
          <h2 className="mt-3 text-3xl font-semibold md:text-4xl">
            {language === "bg"
              ? "Какво казват гостите за нас"
              : "What guests say about us"}
          </h2>
        </div>

        <div className="flex flex-wrap gap-3">
          <a
            href={googleReviewLink}
            target="_blank"
            rel="noreferrer"
            className="review-link rounded-2xl border border-[#c9a56a]/30 bg-[#c9a56a]/10 px-5 py-3 text-sm font-medium text-[#f2d3a0] transition hover:bg-[#c9a56a]/20"
          >
            {language === "bg" ? "Остави отзив в Google" : "Leave a review on Google"}
          </a>
          <a
            href={tripadvisorReviewLink}
            target="_blank"
            rel="noreferrer"
            className="review-link rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-5 py-3 text-sm font-medium text-emerald-100 transition hover:border-emerald-200/45 hover:bg-emerald-400/16"
          >
            {language === "bg" ? "Виж Tripadvisor" : "View Tripadvisor"}
          </a>
        </div>
      </div>

      {loading ? (
        <div className="text-white/60">
          {language === "bg"
            ? "Зареждане на отзиви..."
            : "Loading reviews..."}
        </div>
      ) : reviews.length === 0 ? (
        <div className="text-white/60">
          {language === "bg"
            ? "Отзивите ще бъдат добавени скоро."
            : "Reviews will be added soon."}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {reviews.map((review) => (
            <div
              key={review.reviewId}
              className="review-card rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold text-white">
                    {review.reviewer?.displayName || "Google User"}
                  </div>
                  <div className="mt-1 text-sm text-white/45">
                    {review.relativeTimeDescription || ""}
                  </div>
                </div>

                <Stars rating={review.starRating || 5} />
              </div>

              <p className="mt-5 text-sm leading-7 text-white/70">
                {review.comment ||
                  (language === "bg"
                    ? "Без текстов коментар."
                    : "No text review.")}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
