import { DatabaseState } from './types';

export const DB_STORAGE_KEY = 'scoolmeet_mysql_full_state_v5';

/**
 * Default Seed State mirroring the MySQL Database (database/schema.sql)
 * Default Admin Account:
 *   Phone: 09120000000
 *   Password: admin1234
 * Default Test Student Account:
 *   Phone: 09121112233 (امیرحسین رضایی — کلاس ۹۰۱)
 *   Password: student1234
 */
const INITIAL_DB_STATE: DatabaseState = {
  admin: {
    firstName: 'روزبه',
    lastName: 'توکلی',
    phone: '09120000000',
    email: 'admin@scoolmeet.ir',
    roleTitle: 'مدیر ارشد اسکول میت',
    bio: 'مدرس و مدیر آموزشی پلتفرم اسکول میت — مدیریت یکپارچه کلاس‌های ۹۰۱، ۹۰۲ و ۹۰۳، بررسی تکالیف و پشتیبانی مستمر دانش‌آموزان.',
    password: 'admin1234',
    avatarUrl: '',
  },
  activeStudentId: 101,
  classes: [
    {
      code: '901',
      title: 'کلاس ۹۰۱ - برنامه‌نویسی',
      gradeLevel: '',
      instructorName: 'استاد روزبه توکلی',
      capacity: 30,
      roomOrLink: 'اتاق ۳۰۱ / تالار آنلاین اول',
      scheduleSummary: 'شنبه‌ها و دوشنبه‌ها · ساعت ۱۶:۰۰ تا ۱۷:۳۰',
      description:
        'آموزش طراحی سایت، توسعه فرانت‌اند و پیاده‌سازی پروژه‌های عملی وب.',
    },
    {
      code: '902',
      title: 'کلاس ۹۰۲ - برنامه‌نویسی',
      gradeLevel: '',
      instructorName: 'استاد روزبه توکلی',
      capacity: 30,
      roomOrLink: 'کارگاه کامپیوتر ۲ / تالار آنلاین دوم',
      scheduleSummary: 'یکشنبه‌ها و سه‌شنبه‌ها · ساعت ۱۶:۰۰ تا ۱۷:۳۰',
      description:
        'آموزش طراحی سایت، توسعه فرانت‌اند و پیاده‌سازی پروژه‌های عملی وب.',
    },
    {
      code: '903',
      title: 'کلاس ۹۰۳ - برنامه‌نویسی',
      gradeLevel: '',
      instructorName: 'استاد روزبه توکلی',
      capacity: 25,
      roomOrLink: 'اتاق ۳۰۵ / تالار آنلاین سوم',
      scheduleSummary: 'چهارشنبه‌ها · ساعت ۱۵:۳۰ تا ۱۸:۰۰',
      description:
        'آموزش طراحی سایت، توسعه فرانت‌اند و پیاده‌سازی پروژه‌های عملی وب.',
    },
  ],
  students: [
    {
      id: 101,
      firstName: 'امیرحسین',
      lastName: 'رضایی',
      phone: '09121112233',
      classCode: '901',
      status: 'approved',
      password: 'student1234',
      notes: 'دانش‌آموز منظم و فعال در پروژه‌های طراحی وب (اکانت دانش‌آموز تست).',
      createdAt: '۱۴۰۵/۰۸/۰۱',
    },
    {
      id: 102,
      firstName: 'سارا',
      lastName: 'محمدی',
      phone: '09122223344',
      classCode: '901',
      status: 'approved',
      password: 'student1234',
      notes: 'مشارکت عالی در تمرین‌های گروهی کلاس ۹۰۱.',
      createdAt: '۱۴۰۵/۰۸/۰۲',
    },
    {
      id: 103,
      firstName: 'محمدمهدی',
      lastName: 'کریمی',
      phone: '09123334455',
      classCode: '902',
      status: 'approved',
      password: 'student1234',
      notes: 'علاقه‌مند به مباحث برنامه‌نویسی وب و ساختار داده.',
      createdAt: '۱۴۰۵/۰۸/۰۳',
    },
    {
      id: 104,
      firstName: 'نازنین',
      lastName: 'احمدی',
      phone: '09124445566',
      classCode: '902',
      status: 'pending',
      password: 'student1234',
      notes: 'ثبت‌نام جدید از طریق فرم عمومی سامانه — در انتظار بررسی.',
      createdAt: '۱۴۰۵/۰۸/۱۳',
    },
    {
      id: 105,
      firstName: 'کیان',
      lastName: 'صادقی',
      phone: '09125556677',
      classCode: '903',
      status: 'approved',
      password: 'student1234',
      notes: 'عضو فعال کلاس ۹۰۳.',
      createdAt: '۱۴۰۵/۰۸/۰۴',
    },
    {
      id: 106,
      firstName: 'هلیا',
      lastName: 'موسوی',
      phone: '09126667788',
      classCode: '903',
      status: 'pending',
      password: 'student1234',
      notes: 'درخواست عضویت در کلاس ۹۰۳.',
      createdAt: '۱۴۰۵/۰۸/۱۴',
    },
    {
      id: 107,
      firstName: 'پویا',
      lastName: 'حسینی',
      phone: '09127778899',
      classCode: '901',
      status: 'pending',
      password: 'student1234',
      notes: 'ثبت‌نام جدید کلاس ۹۰۱.',
      createdAt: '۱۴۰۵/۰۸/۱۴',
    },
  ],
  gradebookSessions: [
    {
      id: 9001,
      classCode: '901',
      title: 'جلسه اول — ساختار استاندارد HTML5 و تگ‌های معنایی',
      sessionDate: '۱۴۰۵/۰۸/۰۳',
      topic: 'آشنایی با معماری صفحات وب و تگ‌های معنایی',
    },
    {
      id: 9002,
      classCode: '901',
      title: 'جلسه دوم — چیدمان مدرن با Flexbox و CSS Grid',
      sessionDate: '۱۴۰۵/۰۸/۰۸',
      topic: 'طراحی شبکه‌ای واکنش‌گرا و کارت‌های هم‌اندازه',
    },
    {
      id: 9003,
      classCode: '901',
      title: 'جلسه سوم — فرم‌های تعاملی و اعتبارسنجی جاوااسکریپت',
      sessionDate: '۱۴۰۵/۰۸/۱۲',
      topic: 'بررسی رویدادهای فرم و مدیریت خطاهای کاربر',
    },
    {
      id: 9004,
      classCode: '902',
      title: 'جلسه اول — مبانی طراحی رابط کاربری و تایپوگرافی فارسی',
      sessionDate: '۱۴۰۵/۰۸/۰۴',
      topic: 'اصول راست‌چین‌سازی و کار با فونت وزیرمتن',
    },
    {
      id: 9005,
      classCode: '902',
      title: 'جلسه دوم — برنامه‌نویسی DOM و مدیریت رخدادها',
      sessionDate: '۱۴۰۵/۰۸/۰۹',
      topic: 'انتخابگرها، تغییر پویا و ساخت مودال‌های استاندارد',
    },
    {
      id: 9006,
      classCode: '903',
      title: 'جلسه اول — معماری کامپوننت‌های داشبورد مدیریتی',
      sessionDate: '۱۴۰۵/۰۸/۰۵',
      topic: 'طراحی سایدبار، کارت‌های آماری و جداول داده',
    },
  ],
  gradebookEntries: [
    {
      id: 9101,
      sessionId: 9001,
      studentId: 101,
      classCode: '901',
      attendance: 'present',
      positiveCount: 2,
      negativeCount: 0,
      classScore: 19.5,
      teacherNote: 'پاسخ‌گویی عالی به پرسش‌های کلاسی و مشارکت فعال.',
    },
    {
      id: 9102,
      sessionId: 9001,
      studentId: 102,
      classCode: '901',
      attendance: 'present',
      positiveCount: 3,
      negativeCount: 0,
      classScore: 20,
      teacherNote: 'کدنویسی بسیار تمیز در کارگاه کلاسی.',
    },
    {
      id: 9103,
      sessionId: 9001,
      studentId: 107,
      classCode: '901',
      attendance: 'late',
      positiveCount: 1,
      negativeCount: 1,
      classScore: 17.5,
      teacherNote: 'ورود با ۱۰ دقیقه تأخیر؛ تمرین کلاسی را کامل انجام داد.',
    },
    {
      id: 9104,
      sessionId: 9002,
      studentId: 101,
      classCode: '901',
      attendance: 'present',
      positiveCount: 3,
      negativeCount: 0,
      classScore: 20,
      teacherNote: 'پیاده‌سازی بی‌نقص چیدمان Grid در کلاس.',
    },
    {
      id: 9105,
      sessionId: 9002,
      studentId: 102,
      classCode: '901',
      attendance: 'present',
      positiveCount: 2,
      negativeCount: 0,
      classScore: 19,
      teacherNote: 'عملکرد بسیار خوب در تمرین گروهی.',
    },
    {
      id: 9106,
      sessionId: 9003,
      studentId: 101,
      classCode: '901',
      attendance: 'present',
      positiveCount: 2,
      negativeCount: 0,
      classScore: 19.75,
      teacherNote: 'حل سریع چالش اعتبارسنجی فرم.',
    },
    {
      id: 9107,
      sessionId: 9004,
      studentId: 103,
      classCode: '902',
      attendance: 'present',
      positiveCount: 2,
      negativeCount: 0,
      classScore: 19,
      teacherNote: 'مشارکت منظم در مباحث جلسه.',
    },
    {
      id: 9108,
      sessionId: 9006,
      studentId: 105,
      classCode: '903',
      attendance: 'present',
      positiveCount: 3,
      negativeCount: 0,
      classScore: 20,
      teacherNote: 'طراحی عالی کارت‌های داشبورد.',
    },
  ],
  assignments: [
    {
      id: 201,
      title: 'تمرین اول: طراحی صفحه فرود (Landing Page) واکنش‌گرا',
      description:
        'یک صفحه فرود استاندارد با ساختار HTML5 و استایل‌های CSS Grid و Flexbox طراحی کرده و کدهای پروژه را به همراه تصویر خروجی در قالب فایل ZIP یا PDF ارسال نمایید.',
      classCode: '901',
      dueDate: '۱۴۰۵/۰۸/۲۰ · ساعت ۱۸:۰۰',
      maxScore: 20,
      attachmentName: 'tamrin-1-landing-901.pdf',
      status: 'active',
      createdAt: '۱۴۰۵/۰۸/۱۰',
    },
    {
      id: 202,
      title: 'پروژه عملی: پیاده‌سازی فرم اعتبارسنجی با جاوااسکریپت',
      description:
        'فرم ثبت‌نام کاربر با بررسی لحظه‌ای شماره موبایل، رمز عبور و نمایش پیام‌های خطای فارسی را پیاده‌سازی کرده و فایل پروژه را ارسال کنید.',
      classCode: 'all',
      dueDate: '۱۴۰۵/۰۸/۲۲ · ساعت ۲۳:۵۹',
      maxScore: 20,
      attachmentName: 'project-form-validation-all.zip',
      status: 'active',
      createdAt: '۱۴۰۵/۰۸/۱۱',
    },
    {
      id: 203,
      title: 'تمرین سوم: طراحی کارت‌های داشبورد و جدول داده‌ها',
      description:
        'چیدمان کارت‌های داشبورد و جدول مدیریت کاربران را به صورت کاملاً راست‌چین با فونت وزیرمتن پیاده‌سازی نموده و فایل نهایی را بارگذاری نمایید.',
      classCode: '901',
      dueDate: '۱۴۰۵/۰۸/۲۵ · ساعت ۲۰:۰۰',
      maxScore: 20,
      attachmentName: 'dashboard-ui-901.pdf',
      status: 'active',
      createdAt: '۱۴۰۵/۰۸/۱۲',
    },
  ],
  submissions: [
    {
      id: 301,
      assignmentId: 201,
      studentId: 101,
      studentName: 'امیرحسین رضایی',
      classCode: '901',
      fileName: 'amirhossein-landing-901.zip',
      fileContent:
        'بخش ۱: ساختار معنایی تگ‌های header، main و section.\nبخش ۲: پیاده‌سازی شبکه ۳ ستونه ریسپانسیو با CSS Grid.\nبخش ۳: بهینه‌سازی فونت وزیرمتن و رنگ‌بندی استاندارد.',
      submittedAt: '۱۴۰۵/۰۸/۱۳ · ۱۵:۴۰',
      score: 19.5,
      teacherFeedback:
        'بسیار عالی و استاندارد پیاده‌سازی شده است. ساختار شبکه CSS Grid و تایپوگرافی کاملاً دقیق است.',
      status: 'graded',
    },
    {
      id: 302,
      assignmentId: 201,
      studentId: 102,
      studentName: 'سارا محمدی',
      classCode: '901',
      fileName: 'sara-mohammadi-hw1.pdf',
      fileContent:
        'طراحی کامل هدر، بخش معرفی دوره و کارت‌های ویژگی به همراه نسخه موبایل و تبلت بدون اسکرول افقی.',
      submittedAt: '۱۴۰۵/۰۸/۱۲ · ۱۹:۱۵',
      score: 20,
      teacherFeedback: 'بسیار دقیق و منظم کدنویسی شده است. فاصله‌گذاری کارت‌ها در نمای موبایل عالی است.',
      status: 'graded',
    },
    {
      id: 303,
      assignmentId: 202,
      studentId: 103,
      studentName: 'محمدمهدی کریمی',
      classCode: '902',
      fileName: 'karimi-validation-project.zip',
      fileContent:
        'پیاده‌سازی کامل توابع بررسی شماره تلفن همراه ۱۱ رقمی، تطابق رمز عبور و نمایش مودال تبریک.',
      submittedAt: '۱۴۰۵/۰۸/۱۴ · ۱۱:۲۰',
      score: null,
      teacherFeedback: '',
      status: 'pending',
    },
    {
      id: 304,
      assignmentId: 203,
      studentId: 105,
      studentName: 'کیان صادقی',
      classCode: '903',
      fileName: 'kian-dashboard-cards.zip',
      fileContent:
        'طراحی کارت‌های هم‌اندازه با Flexbox و پیاده‌سازی نوار پیشرفت ظرفیت کلاس‌ها.',
      submittedAt: '۱۴۰۵/۰۸/۱۴ · ۱۴:۰۵',
      score: null,
      teacherFeedback: '',
      status: 'pending',
    },
  ],
  resources: [
    {
      id: 501,
      title: 'جزوه جامع طراحی وب مدرن (HTML5 & CSS3)',
      category: 'جزوه PDF',
      classCode: '901',
      urlOrFileName: 'web-design-booklet-901.pdf',
      fileSize: '۳.۸ مگابایت',
      description: 'شامل درس‌نامه کامل چیدمان Flexbox و Grid به همراه مثال‌های کاربردی ویژه کلاس ۹۰۱.',
      createdAt: '۱۴۰۵/۰۸/۰۵',
      viewers: [
        {
          studentId: 101,
          studentName: 'امیرحسین رضایی',
          classCode: '901',
          viewedAt: '۱۴۰۵/۰۸/۰۶ · ۱۸:۲۰',
        },
        {
          studentId: 102,
          studentName: 'سارا محمدی',
          classCode: '901',
          viewedAt: '۱۴۰۵/۰۸/۰۷ · ۱۰:۱۵',
        },
      ],
    },
    {
      id: 502,
      title: 'فایل تمرین‌های کارگاهی جاوااسکریپت و DOM',
      category: 'فایل تمرین',
      classCode: '902',
      urlOrFileName: 'js-dom-exercises-902.zip',
      fileSize: '۵.۲ مگابایت',
      description: 'مجموعه نمونه کدهای استاندارد مدیریت رویدادها و فرم‌ها برای کلاس ۹۰۲.',
      createdAt: '۱۴۰۵/۰۸/۰۷',
      viewers: [
        {
          studentId: 103,
          studentName: 'محمدمهدی کریمی',
          classCode: '902',
          viewedAt: '۱۴۰۵/۰۸/۰۸ · ۱۶:۴۵',
        },
      ],
    },
    {
      id: 503,
      title: 'ویدیو ضبط‌شده: معماری رابط کاربری و طراحی کامپوننت',
      category: 'ویدیو ضبط‌شده',
      classCode: 'all',
      urlOrFileName: 'ui-architecture-session-all.mp4',
      fileSize: '۴۵ مگابایت',
      description: 'آموزش گام‌به‌گام پیاده‌سازی پنل‌های مدیریتی راست‌چین ویژه تمامی کلاس‌ها.',
      createdAt: '۱۴۰۵/۰۸/۰۹',
      viewers: [
        {
          studentId: 105,
          studentName: 'کیان صادقی',
          classCode: '903',
          viewedAt: '۱۴۰۵/۰۸/۱۰ · ۲۰:۱۰',
        },
      ],
    },
    {
      id: 504,
      title: 'راهنمای استاندارد ارسال تکالیف در سامانه اسکول میت',
      category: 'لینک آموزشی',
      classCode: 'all',
      urlOrFileName: 'scoolmeet-homework-guide.pdf',
      fileSize: '۱.۴ مگابایت',
      description: 'مشترک برای هر سه کلاس ۹۰۱، ۹۰۲ و ۹۰۳ جهت آشنایی با نحوه نام‌گذاری و بارگذاری فایل‌ها.',
      createdAt: '۱۴۰۵/۰۸/۰۱',
      viewers: [
        {
          studentId: 101,
          studentName: 'امیرحسین رضایی',
          classCode: '901',
          viewedAt: '۱۴۰۵/۰۸/۰۲ · ۱۲:۳۰',
        },
        {
          studentId: 103,
          studentName: 'محمدمهدی کریمی',
          classCode: '902',
          viewedAt: '۱۴۰۵/۰۸/۰۳ · ۱۴:۰۰',
        },
        {
          studentId: 105,
          studentName: 'کیان صادقی',
          classCode: '903',
          viewedAt: '۱۴۰۵/۰۸/۰۴ · ۱۹:۲۵',
        },
      ],
    },
  ],
  announcements: [
    {
      id: 601,
      title: 'برگزاری کارگاه عملی طراحی رابط کاربری در هفته آینده',
      content:
        'به اطلاع کلیه دانش‌آموزان کلاس‌های ۹۰۱، ۹۰۲ و ۹۰۳ می‌رساند کارگاه عملی بررسی پروژه‌های فرانت‌اند در ابتدای جلسه اول هفته آینده برگزار خواهد شد. مطالعه جزوات بارگذاری‌شده در بخش منابع آموزشی الزامی است.',
      targetClasses: 'all',
      priority: 'مهم',
      createdAt: '۱۴۰۵/۰۸/۱۲ · ۱۰:۳۰',
    },
    {
      id: 602,
      title: 'تمدید مهلت ارسال تمرین اول ویژه کلاس ۹۰۱',
      content:
        'مهلت بارگذاری فایل تمرین اول کلاس ۹۰۱ تا روز چهارشنبه ساعت ۱۸:۰۰ تمدید گردید. لطفاً فایل خود را در قالب PDF یا ZIP ارسال نمایید.',
      targetClasses: '901',
      priority: 'عادی',
      createdAt: '۱۴۰۵/۰۸/۱۳ · ۱۷:۱۵',
    },
  ],
  tickets: [
    {
      id: 701,
      studentId: 101,
      studentName: 'امیرحسین رضایی',
      studentPhone: '09121112233',
      classCode: '901',
      subject: 'سوال در مورد چیدمان کارت‌ها با CSS Grid',
      priority: 'مهم',
      status: 'پاسخ داده شده',
      createdAt: '۱۴۰۵/۰۸/۱۴ · ۰۹:۴۵',
      messages: [
        {
          id: 1,
          senderRole: 'student',
          senderName: 'امیرحسین رضایی',
          message:
            'سلام استاد وقت بخیر. در تمرین اول، چطور می‌توانیم ارتفاع تمام کارت‌های یک ردیف را کاملاً هم‌اندازه نگه داریم؟',
          sentAt: '۱۴۰۵/۰۸/۱۴ · ۰۹:۴۵',
          attachmentName: 'grid-cards-sample.zip',
        },
        {
          id: 2,
          senderRole: 'admin',
          senderName: 'روزبه توکلی',
          message:
            'سلام امیرحسین جان. کافی است روی کانتینر Grid ویژگی align-items: stretch و روی کارت‌ها height: 100% همراه با display: flex; flex-direction: column; justify-content: space-between قرار دهی. نمونه کد را برایت ضمیمه کردم.',
          sentAt: '۱۴۰۵/۰۸/۱۴ · ۱۰:۲۰',
          attachmentName: 'equal-height-cards-guide.pdf',
        },
      ],
    },
    {
      id: 702,
      studentId: 103,
      studentName: 'محمدمهدی کریمی',
      studentPhone: '09123334455',
      classCode: '902',
      subject: 'درخواست فایل نمونه کدهای جلسه یکشنبه کلاس ۹۰۲',
      priority: 'عادی',
      status: 'در انتظار پاسخ',
      createdAt: '۱۴۰۵/۰۸/۱۴ · ۱۲:۱۰',
      messages: [
        {
          id: 1,
          senderRole: 'student',
          senderName: 'محمدمهدی کریمی',
          message:
            'سلام استاد، ممنون می‌شوم فایل تمرین‌های حل‌شده در کارگاه روز یکشنبه را در بخش منابع آموزشی یا همین تیکت ارسال فرمایید.',
          sentAt: '۱۴۰۵/۰۸/۱۴ · ۱۲:۱۰',
        },
      ],
    },
    {
      id: 703,
      studentId: 105,
      studentName: 'کیان صادقی',
      studentPhone: '09125556677',
      classCode: '903',
      subject: 'هماهنگی جهت تحویل پروژه داشبورد',
      priority: 'عادی',
      status: 'پاسخ داده شده',
      createdAt: '۱۴۰۵/۰۸/۱۱ · ۱۸:۲۰',
      messages: [
        {
          id: 1,
          senderRole: 'student',
          senderName: 'کیان صادقی',
          message: 'سلام استاد، فایل پروژه را به همراه مستندات آماده کرده‌ام.',
          sentAt: '۱۴۰۵/۰۸/۱۱ · ۱۸:۲۰',
          attachmentName: 'kian-project-preview.pdf',
        },
        {
          id: 2,
          senderRole: 'admin',
          senderName: 'روزبه توکلی',
          message:
            'سلام کیان عزیز، بسیار عالی. فایل راهنمای تکمیلی را هم برایت پیوست کردم.',
          sentAt: '۱۴۰۵/۰۸/۱۱ · ۱۹:۰۵',
          attachmentName: 'guide-checklist-903.pdf',
        },
      ],
    },
  ],
  activities: [
    {
      id: 801,
      title: 'ثبت‌نام دانش‌آموز جدید (پویا حسینی — کلاس ۹۰۱)',
      detail: 'حساب کاربری جدید ثبت شد و در انتظار تأیید مدیر قرار گرفت.',
      timeAgo: '۱۵ دقیقه پیش',
      category: 'student',
    },
    {
      id: 802,
      title: 'ارسال فایل تکلیف توسط کیان صادقی (کلاس ۹۰۳)',
      detail: 'فایل kian-dashboard-cards.zip برای تصحیح بارگذاری شد.',
      timeAgo: '۱ ساعت پیش',
      category: 'assignment',
    },
    {
      id: 803,
      title: 'ثبت تیکت جدید توسط امیرحسین رضایی (کلاس ۹۰۱)',
      detail: 'موضوع: سوال در مورد چیدمان کارت‌ها با CSS Grid.',
      timeAgo: '۲ ساعت پیش',
      category: 'ticket',
    },
    {
      id: 804,
      title: 'ارسال اطلاعیه عمومی به هر سه کلاس ۹۰۱، ۹۰۲ و ۹۰۳',
      detail: 'عنوان اطلاعیه: برگزاری کارگاه عملی طراحی رابط کاربری در هفته آینده.',
      timeAgo: 'دیروز',
      category: 'announcement',
    },
  ],
  settings: {
    platformName: 'اسکول میت | ScoolMeet',
    academicYear: '۱۴۰۵-۱۴۰۶',
    allowNewRegistrations: true,
    requireAdminApproval: true,
    maxUploadSizeMb: 15,
    supportPhone: '09120000000',
  },
};

export function loadDbState(): DatabaseState {
  try {
    const raw = window.localStorage.getItem(DB_STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(INITIAL_DB_STATE));
      return JSON.parse(JSON.stringify(INITIAL_DB_STATE)) as DatabaseState;
    }
    const parsed = JSON.parse(raw) as Partial<DatabaseState>;
    return {
      ...INITIAL_DB_STATE,
      ...parsed,
      admin: {
        ...INITIAL_DB_STATE.admin,
        ...(parsed.admin || {}),
      },
      settings: {
        ...INITIAL_DB_STATE.settings,
        ...(parsed.settings || {}),
      },
    };
  } catch {
    return JSON.parse(JSON.stringify(INITIAL_DB_STATE)) as DatabaseState;
  }
}

export function saveDbState(state: DatabaseState): void {
  try {
    window.localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota issues in restricted iframes
  }
}

export function resetDbState(): void {
  try {
    window.localStorage.removeItem(DB_STORAGE_KEY);
  } catch {
    // Ignore storage issues
  }
}

export function logAdminActivity(
  state: DatabaseState,
  title: string,
  detail: string,
  category: 'student' | 'assignment' | 'ticket' | 'announcement'
): void {
  state.activities.unshift({
    id: Date.now(),
    title,
    detail,
    timeAgo: 'هم‌اکنون',
    category,
  });
  if (state.activities.length > 15) {
    state.activities = state.activities.slice(0, 15);
  }
  saveDbState(state);
}
