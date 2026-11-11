const track = document.getElementById("announcementTrack");
const dots = document.querySelectorAll(".dot");
let currentSlide = 0;
const totalSlides = document.querySelectorAll(".announcement-item").length;

function showSlide(index) {
    if (!track || totalSlides === 0) return;
    currentSlide = index;
    track.style.transform = `translateX(-${currentSlide * 100}%)`;
    dots.forEach((dot, i) => {
        dot.classList.toggle("active", i === currentSlide);
    });
}

if (track && totalSlides > 1 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    let slideTimer;
    const startSlideshow = () => {
        if (slideTimer || document.hidden) return;
        slideTimer = window.setInterval(() => {
            showSlide((currentSlide + 1) % totalSlides);
        }, 3000);
    };
    const stopSlideshow = () => {
        window.clearInterval(slideTimer);
        slideTimer = undefined;
    };

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            stopSlideshow();
        } else {
            startSlideshow();
        }
    });
    startSlideshow();
}