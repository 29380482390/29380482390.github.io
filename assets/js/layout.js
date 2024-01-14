const generateLayout = () => {
	let firstButtonsContainer = `
    <div class="buttonsContainer" id="buttons_1"></div>
  `;
	let secondButtonsContainer = `
    <div class="buttonsContainer" id="buttons_2"></div>
  `;

	const position = 'beforeend';

	switch (null) {
		default:
			linksBlockLeft.insertAdjacentHTML(position, firstButtonsContainer);
			linksBlockRight.insertAdjacentHTML(position, secondButtonsContainer);
			linksBlock.classList.add('removeGap');
			break;
	}
};

generateLayout();