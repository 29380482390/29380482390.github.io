// array of card objects representing various web applications
// each card can contain: name, icon class, link
const CARDS = [{
        name: "wg board",
        icon: "ri-apps-fill",
        link: "https://boards.4chan.org/wg/"
    },
    {
        name: "x.com",
        icon: "ri-twitter-x-line",
        link: "https://x.com"
    },
    {
        name: "reddit",
        icon: "ri-reddit-line",
        link: "https://www.reddit.com/"
    },
    {
        name: "instagram",
        icon: "ri-instagram-fill",
        link: "https://instagram.com/"
    },
    {
        name: "youtube",
        icon: "ri-youtube-fill",
        link: "https://www.youtube.com/"
    },
    {
        name: "twitch",
        icon: "ri-twitch-fill",
        link: "https://www.twitch.tv/"
    },
    {
        name: "deepseek",
        icon: "ri-openai-line",
        link: "https://chat.deepseek.com/"
    },
    {
        name: "proton",
        icon: "ri-command-line",
        link: "https://account.proton.me/apps/"
    },
    {
        name: "gmail",
        icon: "ri-mail-line",
        link: "https://mail.google.com/"
    },
    {
        name: "notes",
        icon: "ri-sticky-note-fill",
        link: "https://keep.google.com/u/0/"
    },
    {
        name: "fmhy",
        icon: "ri-file-paper-2-line",
        link: "https://fmhy.net/"
    },
    {
        name: "megathread",
        icon: "ri-file-list-2-line",
        link: "https://www.reddit.com/r/Piracy/wiki/megathread/"
    }
];

// dynamically creates and displays all cards in the container
const printCards = () => {
    for (const card of CARDS) {
        // create card elements
        let currentCard = document.createElement("a");
        let currentCardText = document.createElement("p");
        currentCardText.appendChild(document.createTextNode(card.name));
        let currentCardIcon = document.createElement("i");
        currentCardIcon.classList.add(card.icon);

        // add styling classes
        currentCard.classList.add("card");
        currentCard.href = card.link;
        currentCardIcon.classList.add("card__icon");
        currentCardText.classList.add("card__name");

        // append icon and text to the card
        currentCard.append(currentCardIcon);
        currentCard.append(currentCardText);

        // set custom attributes to track interaction state
        currentCard.setAttribute("isHovered", false);
        currentCard.setAttribute("isFocused", false);

        // add the card
        cardContainer.appendChild(currentCard);

        // optional clipboard functionality if 'clipboard' property is present
        currentCard.addEventListener("click", async (event) => {
            if (!card.clipboard) return;

            event.preventDefault();

            try {
                await navigator.clipboard.writeText(card.link);
                currentCard.blur();
                currentCardText.innerText = "Saved to clipboard!";
                setTimeout(() => {
                    currentCardText.innerText = card.name;
                }, 1500);
            } catch {
                currentCardText.innerText = "Unable to copy";
                setTimeout(() => {
                    currentCardText.innerText = card.name;
                }, 1500);
            }
        });
    }
};

// call the function to render the cards
printCards();

// fade-in animation once the body is fully loaded
window.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('fade-in');
});
