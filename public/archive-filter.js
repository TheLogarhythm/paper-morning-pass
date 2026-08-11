const filters = document.querySelector('[data-archive-filters]');
const list = document.querySelector('[data-archive-list]');
const emptyMessage = document.querySelector('[data-archive-empty]');

if (filters instanceof HTMLFieldSetElement && list instanceof HTMLOListElement) {
  filters.hidden = false;
  const topic = filters.querySelector('select[name="topic"]');
  const month = filters.querySelector('input[name="month"]');
  const editions = [...list.querySelectorAll(':scope > li')];

  const applyFilters = () => {
    const selectedTopic = topic instanceof HTMLSelectElement ? topic.value : '';
    const selectedMonth = month instanceof HTMLInputElement ? month.value : '';
    let visibleCount = 0;

    for (const edition of editions) {
      const matchesTopic = !selectedTopic || edition.dataset.topics?.split(' ').includes(selectedTopic);
      const matchesMonth = !selectedMonth || edition.dataset.month === selectedMonth;
      edition.hidden = !(matchesTopic && matchesMonth);
      if (!edition.hidden) visibleCount += 1;
    }

    if (emptyMessage instanceof HTMLElement) emptyMessage.hidden = visibleCount > 0;
  };

  filters.addEventListener('input', applyFilters);
}
