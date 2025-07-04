// get references to the search box container and input field
const searchBox = document.getElementById("searchBox");
const searchInput = document.getElementById("searchInput");

// track whether the user is currently typing
let isTyping = false;

// listen for keydown events on the entire document
document.addEventListener("keydown", (e) => {
    if (
        e.ctrlKey || e.metaKey || e.altKey ||
        document.activeElement.tagName === "INPUT" ||
        document.activeElement.tagName === "TEXTAREA"
    ) {
        return;
    }

    if (e.key.length !== 1) {
        return;
    }

    if (!isTyping) {
        document.body.classList.add("search-active");
        searchBox.classList.add("visible");
        searchInput.value = e.key;
        isTyping = true;
    } else {
        searchInput.value += e.key;
    }

    searchInput.focus();
    searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
    e.preventDefault();
});

// detect if input is a valid domain
function isProbablyURL(input) {
    // If it contains a dot and no spaces, it's probably a domain
    return /^[^\s]+\.[^\s]+$/.test(input);
}

// handle key presses inside the search input
searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        const rawQuery = searchInput.value.trim();

        if (rawQuery) {
            if (isProbablyURL(rawQuery)) {
                // if it doesn't start with http/https, add it
                const url = rawQuery.match(/^https?:\/\//) ? rawQuery : `https://${rawQuery}`;
                window.location.href = url;
            } else {
                const query = encodeURIComponent(rawQuery);
                window.location.href = `https://duckduckgo.com/?q=${query}`;
            }
        }
    } else if (e.key === "Escape") {
        searchBox.classList.remove("visible");
        document.body.classList.remove("search-active");
        isTyping = false;
        searchInput.blur();
    }
});

// when the input loses focus, hide search after a short delay
searchInput.addEventListener("blur", () => {
    setTimeout(() => {
        document.body.classList.remove("search-active");
        searchBox.classList.remove("visible");
        isTyping = false;
    }, 200);
});

// get all card elements on the page
const cards = document.querySelectorAll('.card');
