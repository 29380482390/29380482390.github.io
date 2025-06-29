// get references to the search box container and input field
const searchBox = document.getElementById("searchBox");
const searchInput = document.getElementById("searchInput");

// track whether the user is currently typing
let isTyping = false;

// listen for keydown events on the entire document
document.addEventListener("keydown", (e) => {
    // ignore if user is holding modifier keys or typing in an input/textarea
    if (
        e.ctrlKey || e.metaKey || e.altKey ||
        document.activeElement.tagName === "INPUT" ||
        document.activeElement.tagName === "TEXTAREA"
    ) {
        return;
    }

    // ignore non-character keys (e.g., arrows, shift, etc.)
    if (e.key.length !== 1) {
        return;
    }

    // activate the search if typing begins
    if (!isTyping) {
        document.body.classList.add("search-active");
        searchBox.classList.add("visible");
        searchInput.value = e.key; // Insert the first key manually
        isTyping = true;
    } else {
        // Append key to input if already typing
        searchInput.value += e.key;
    }

    // focus the input and move cursor to the end
    searchInput.focus();
    searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);

    // prevent default behavior of the key
    e.preventDefault();
});

// handle key presses inside the search input
searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        // search the query
        const query = encodeURIComponent(searchInput.value.trim());
        if (query) {
            window.location.href = `https://duckduckgo.com/?q=${query}`;
        }
    } else if (e.key === "Escape") {
        // hide search box and reset state when esc is pressed
        searchBox.classList.remove("visible");
        document.body.classList.remove("search-active");
        isTyping = false;
        searchInput.blur(); // remove focus from input
    }
});

// when the input loses focus, hide search after a short delay
searchInput.addEventListener("blur", () => {
    setTimeout(() => {
        document.body.classList.remove("search-active");
        searchBox.classList.remove("visible");
        isTyping = false;
    }, 200); // delay helps with enter/esc key registration
});

// get all card elements on the page
const cards = document.querySelectorAll('.card');
