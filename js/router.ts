import $ from 'jquery';
import { AdminSectionId } from './types';

export type AppRoutePath =
  | '/login'
  | '/register'
  | '/admin/dashboard'
  | '/admin/classes'
  | '/admin/students'
  | '/admin/assignments'
  | '/admin/schedule'
  | '/admin/resources'
  | '/admin/announcements'
  | '/admin/tickets'
  | '/admin/profile'
  | '/admin/settings';

const ADMIN_SECTIONS: AdminSectionId[] = [
  'dashboard',
  'classes',
  'students',
  'assignments',
  'schedule',
  'resources',
  'announcements',
  'tickets',
  'profile',
  'settings',
];

const ROUTE_TITLES: Record<AppRoutePath, string> = {
  '/login': 'ورود به حساب | اسکول میت',
  '/register': 'ثبت‌نام دانش‌آموز | اسکول میت',
  '/admin/dashboard': 'داشبورد مدیریت | اسکول میت',
  '/admin/classes': 'مدیریت کلاس‌ها | اسکول میت',
  '/admin/students': 'مدیریت دانش‌آموزان | اسکول میت',
  '/admin/assignments': 'مدیریت تکالیف | اسکول میت',
  '/admin/schedule': 'برنامه کلاس‌ها | اسکول میت',
  '/admin/resources': 'منابع آموزشی | اسکول میت',
  '/admin/announcements': 'اطلاعیه‌ها | اسکول میت',
  '/admin/tickets': 'تیکت‌های پشتیبانی | اسکول میت',
  '/admin/profile': 'پروفایل مدیر | اسکول میت',
  '/admin/settings': 'تنظیمات سامانه | اسکول میت',
};

/**
 * Push or replace URL in browser address bar and update page title
 */
export function updateBrowserUrl(path: AppRoutePath, replace = false): void {
  try {
    if (window.location.pathname !== path) {
      if (replace) {
        window.history.replaceState({ path }, ROUTE_TITLES[path], path);
      } else {
        window.history.pushState({ path }, ROUTE_TITLES[path], path);
      }
    }
    document.title = ROUTE_TITLES[path] || 'ScoolMeet | اسکول میت';
    $('#admin-current-url-badge').text(path);
  } catch {
    // Fallback if pushState is restricted
  }
}

/**
 * Parse current window.location.pathname into either an auth tab or admin section
 */
export function parseCurrentLocation():
  | { view: 'auth'; tab: 'login' | 'register' }
  | { view: 'admin'; section: AdminSectionId } {
  const rawPath = window.location.pathname.replace(/\/+$/, '') || '/login';

  if (rawPath === '/register') {
    return { view: 'auth', tab: 'register' };
  }

  if (rawPath === '/admin' || rawPath.startsWith('/admin/')) {
    const seg = rawPath.split('/')[2] as AdminSectionId | undefined;
    if (seg && ADMIN_SECTIONS.includes(seg)) {
      return { view: 'admin', section: seg };
    }
    return { view: 'admin', section: 'dashboard' };
  }

  return { view: 'auth', tab: 'login' };
}
