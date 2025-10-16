/**
 * Groups items by date categories: today, yesterday, this week, this month, older
 */
export function groupItemsByDate<T extends { createdAt: number }>(items: T[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const thisWeekStart = new Date(today);
  thisWeekStart.setDate(today.getDate() - today.getDay()); // Sunday
  
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const groups: Record<string, T[]> = {
    today: [],
    yesterday: [],
    thisWeek: [],
    thisMonth: [],
    older: []
  };
  
  items.forEach(item => {
    const itemDate = new Date(item.createdAt);
    
    if (itemDate >= today) {
      groups.today.push(item);
    } else if (itemDate >= yesterday) {
      groups.yesterday.push(item);
    } else if (itemDate >= thisWeekStart) {
      groups.thisWeek.push(item);
    } else if (itemDate >= thisMonthStart) {
      groups.thisMonth.push(item);
    } else {
      groups.older.push(item);
    }
  });
  
  return groups;
}

/**
 * Formats a group name for display
 */
export function formatGroupName(groupName: string): string {
  switch (groupName) {
    case 'today':
      return 'Added Today';
    case 'yesterday':
      return 'Added Yesterday';
    case 'thisWeek':
      return 'Added This Week';
    case 'thisMonth':
      return 'Added This Month';
    case 'older':
      return 'Added Earlier';
    default:
      return groupName;
  }
}