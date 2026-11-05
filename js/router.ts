import { AdminSectionId, StudentSectionId } from './types';

export type AppRoutePath =
  | '/login'
  | '/register'
  | '/admin/dashboard'
  | '/admin/classes'
  | '/admin/students'
  | '/admin/gradebook'
  | '/admin/assignments'
  | '/admin/assignments/create'
  | '/admin/assignments/edit'
  | '/admin/assignments/detail'
  | '/admin/assignments/submission'
  | '/admin/resources'
  | '/admin/resources/create'
  | '/admin/resources/edit'
  | '/admin/resources/detail'
  | '/admin/announcements'
  | '/admin/tickets'
  | '/admin/profile'
  | '/admin/settings'
  | '/student/dashboard'
  | '/student/assignments'
  | '/student/assignments/detail'
  | '/student/grades'
  | '/student/resources'
  | '/student/resources/detail'
  | '/student/announcements'
  | '/student/tickets'
  | '/student/profile';

const ADMIN_SECTIONS: AdminSectionId[] = [
  'dashboard',
  'classes',
  'students',
  'gradebook',
  'assignments',
  'resources',
  'announcements',
  'tickets',
  'profile',
  'settings',
];

const STUDENT_SECTIONS: StudentSectionId[] = [
  'dashboard',
  'assignments',
  'grades',
  'resources',
  'announcements',
  'tickets',
  'profile',
];

const ROUTE_TITLES: Record<AppRoutePath, string> = {
  '/login': 'ورود به حساب | اسکول میت',
  '/register': 'ثبت‌نام دانش‌آموز | اسکول میت',
  '/admin/dashboard': 'داشبورد مدیریت | اسکول میت',
  '/admin/classes': 'مدیریت کلاس‌ها | اسکول میت',
  '/admin/students': 'مدیریت دانش‌آموزان | اسکول میت',
  '/admin/gradebook': 'دفتر نمره و حضور و غیاب | اسکول میت',
  '/admin/assignments': 'مدیریت تکالیف | اسکول میت',
  '/admin/assignments/create': 'ایجاد تکلیف جدید | اسکول میت',
  '/admin/assignments/edit': 'ویرایش تکلیف | اسکول میت',
  '/admin/assignments/detail': 'جزئیات تکلیف و وضعیت تحویل | اسکول میت',
  '/admin/assignments/submission': 'مشاهده پاسخ دانش‌آموز و ثبت نمره | اسکول میت',
  '/admin/resources': 'منابع آموزشی | اسکول میت',
  '/admin/resources/create': 'افزودن منبع آموزشی جدید | اسکول میت',
  '/admin/resources/edit': 'ویرایش منبع آموزشی | اسکول میت',
  '/admin/resources/detail': 'جزئیات منبع آموزشی و مشاهده‌کنندگان | اسکول میت',
  '/admin/announcements': 'اطلاعیه‌ها | اسکول میت',
  '/admin/tickets': 'تیکت‌های پشتیبانی | اسکول میت',
  '/admin/profile': 'پروفایل مدیر | اسکول میت',
  '/admin/settings': 'تنظیمات سامانه | اسکول میت',
  '/student/dashboard': 'داشبورد دانش‌آموز | اسکول میت',
  '/student/assignments': 'تکالیف من | اسکول میت',
  '/student/assignments/detail': 'مشاهده و ارسال تکلیف | اسکول میت',
  '/student/grades': 'نمرات من و کارنامه | اسکول میت',
  '/student/resources': 'منابع آموزشی کلاس | اسکول میت',
  '/student/resources/detail': 'مشاهده و دانلود منبع آموزشی | اسکول میت',
  '/student/announcements': 'اطلاعیه‌های کلاس | اسکول میت',
  '/student/tickets': 'تیکت و ارتباط با مدرس | اسکول میت',
  '/student/profile': 'پروفایل دانش‌آموز | اسکول میت',
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
  } catch {
    // Fallback if pushState is restricted
  }
}

/**
 * Parse current window.location.pathname into either an auth tab, admin section, or student section
 */
export function parseCurrentLocation():
  | { view: 'auth'; tab: 'login' | 'register' }
  | { view: 'admin'; section: AdminSectionId; subPage?: string }
  | { view: 'student'; section: StudentSectionId; subPage?: string } {
  const rawPath = window.location.pathname.replace(/\/+$/, '') || '/login';

  if (rawPath === '/register') {
    return { view: 'auth', tab: 'register' };
  }

  if (rawPath === '/admin' || rawPath.startsWith('/admin/')) {
    const parts = rawPath.split('/');
    const seg = parts[2] as AdminSectionId | undefined;
    const subPage = parts[3] || undefined;
    if (seg && ADMIN_SECTIONS.includes(seg)) {
      return { view: 'admin', section: seg, subPage };
    }
    return { view: 'admin', section: 'dashboard' };
  }

  if (rawPath === '/student' || rawPath.startsWith('/student/')) {
    const parts = rawPath.split('/');
    const seg = parts[2] as StudentSectionId | undefined;
    const subPage = parts[3] || undefined;
    if (seg && STUDENT_SECTIONS.includes(seg)) {
      return { view: 'student', section: seg, subPage };
    }
    return { view: 'student', section: 'dashboard' };
  }

  return { view: 'auth', tab: 'login' };
}
