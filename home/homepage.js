const track = document.getElementById("announcementTrack");
const dots = document.querySelectorAll(".dot");

let currentSlide = 0;
const totalSlides = document.querySelectorAll(".announcement-item").length;

function showSlide(index) {
    currentSlide = index;
    track.style.transform = `translateX(-${currentSlide * 100}%)`;
    dots.forEach((dot, i) => {
        dot.classList.toggle("active", i === currentSlide);
    });
}
// เลื่อนประกาศอัตโนมัติทุก 3 วินาที
setInterval(function() {
    currentSlide++;
    if (currentSlide >= totalSlides) {
        currentSlide = 0;
    }
    showSlide(currentSlide);
}, 3000);