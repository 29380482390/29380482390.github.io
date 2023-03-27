$(document).ready(function() {
  $('.tab.1').addClass('active');
  $('.tabs-item').first().addClass('active');

  $('.tabs-item').click((ev) => {
      $('.tabs-item.active').removeClass('active');
      $(ev.target).addClass('active');
      linkTabs();
  });

  $(document).on('keydown', (ev) => {
      if (ev.which === 9) {
          ev.preventDefault();
          ev.stopPropagation();
          const $next = $('.tabs-item.active').removeClass('active').next('.tabs-item');
          $next.length ? $next.addClass('active') : $(".tabs-item:first").addClass('active');
          linkTabs();
      }
  });

});

const linkTabs = () => {
  const activeTabHeader = $('.tabs-item.active').attr('class').split(' ')[1];
  $('.tab.active').removeClass('active');
  $(`.tab.${activeTabHeader}`).addClass('active');
};