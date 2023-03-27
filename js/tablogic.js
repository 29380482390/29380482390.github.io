$(document).ready(function () {
  $('.tabs-item.item-1').addClass('active');
  $('.tab-header-item').first().addClass('active');

  $('.tab-header-item').click((ev) => {
    $('.tab-header-item.active').removeClass('active');
    $(ev.target).addClass('active');
    linkTabs();
  });

  $(document).on('keydown', (ev) => {
    if (ev.which === 9) { 
      ev.preventDefault(); 
      ev.stopPropagation();
      const $next = $('.tab-header-item.active').removeClass('active').next('.tab-header-item');
      $next.length ? $next.addClass('active') : $(".tab-header-item:first").addClass('active');
      linkTabs();
    } 
  });

});

const linkTabs = () => {
  const activeTabHeader = $('.tab-header-item.active').attr('class').split(' ')[1];
  $('.tabs-item.active').removeClass('active');
  $(`.tabs-item.${activeTabHeader}`).addClass('active');
};
