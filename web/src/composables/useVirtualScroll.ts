import { ref, computed, onMounted, onUnmounted } from 'vue';

export function useVirtualScroll<T>(
  items: T[],
  itemHeight: number = 200,
  containerHeight: number = 600
) {
  const scrollTop = ref(0);
  const containerRef = ref<HTMLElement | null>(null);

  const totalHeight = computed(() => items.length * itemHeight);

  const visibleCount = computed(() => Math.ceil(containerHeight / itemHeight) + 2);

  const startIndex = computed(() => Math.floor(scrollTop.value / itemHeight));

  const endIndex = computed(() => Math.min(startIndex.value + visibleCount.value, items.length));

  const visibleItems = computed(() => items.slice(startIndex.value, endIndex.value));

  const offsetY = computed(() => startIndex.value * itemHeight);

  const handleScroll = (e: Event) => {
    const target = e.target as HTMLElement;
    scrollTop.value = target.scrollTop;
  };

  onMounted(() => {
    if (containerRef.value) {
      containerRef.value.addEventListener('scroll', handleScroll);
    }
  });

  onUnmounted(() => {
    if (containerRef.value) {
      containerRef.value.removeEventListener('scroll', handleScroll);
    }
  });

  return {
    containerRef,
    totalHeight,
    visibleItems,
    offsetY,
    startIndex,
    endIndex,
  };
}
