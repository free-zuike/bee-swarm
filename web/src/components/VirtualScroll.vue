<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';

interface VirtualScrollProps<T> {
  items: T[];
  itemHeight: number;
  containerHeight?: number;
  buffer?: number;
}

const props = withDefaults(defineProps<VirtualScrollProps<any>>(), {
  containerHeight: 500,
  buffer: 3,
});

const emit = defineEmits<{
  'update:scroll-top': [scrollTop: number];
}>();

const scrollContainer = ref<HTMLElement | null>(null);
const scrollTop = ref(0);
const visibleItems = ref<any[]>([]);
const startIndex = ref(0);
const endIndex = ref(0);

const totalItems = computed(() => props.items.length);
const totalHeight = computed(() => totalItems.value * props.itemHeight);
const visibleCount = computed(() => Math.ceil(props.containerHeight / props.itemHeight));
const paddedCount = computed(() => visibleCount.value + props.buffer * 2);

function updateVisibleItems() {
  if (totalItems.value === 0) {
    visibleItems.value = [];
    startIndex.value = 0;
    endIndex.value = 0;
    return;
  }

  const currentStart = Math.max(0, Math.floor(scrollTop.value / props.itemHeight) - props.buffer);
  const currentEnd = Math.min(
    totalItems.value,
    currentStart + paddedCount.value
  );

  startIndex.value = currentStart;
  endIndex.value = currentEnd;
  
  visibleItems.value = props.items.slice(currentStart, currentEnd);
  
  emit('update:scroll-top', scrollTop.value);
}

function handleScroll() {
  if (scrollContainer.value) {
    scrollTop.value = scrollContainer.value.scrollTop;
    updateVisibleItems();
  }
}

function scrollToIndex(index: number, smooth = false) {
  if (scrollContainer.value) {
    scrollContainer.value.scrollTo({
      top: index * props.itemHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }
}

defineExpose({
  scrollToIndex,
});

onMounted(() => {
  updateVisibleItems();
});

onUnmounted(() => {
  scrollContainer.value?.removeEventListener('scroll', handleScroll);
});
</script>

<template>
  <div
    ref="scrollContainer"
    class="virtual-scroll-container"
    :style="{ height: `${containerHeight}px` }"
    @scroll="handleScroll"
  >
    <div
      class="virtual-scroll-spacer"
      :style="{ height: `${totalHeight}px` }"
    />
    <div
      class="virtual-scroll-content"
      :style="{
        transform: `translateY(${startIndex * itemHeight}px)`,
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
      }"
    >
      <slot
        v-for="(item, idx) in visibleItems"
        :key="item.id || idx"
        :item="item"
        :index="startIndex + idx"
        :visible-index="idx"
      />
    </div>
  </div>
</template>

<style scoped>
.virtual-scroll-container {
  position: relative;
  overflow-y: auto;
  overflow-x: hidden;
  will-change: scroll-position;
}

.virtual-scroll-spacer {
  position: relative;
}

.virtual-scroll-content {
  will-change: transform;
  backface-visibility: hidden;
  contain: layout paint style;
}
</style>
