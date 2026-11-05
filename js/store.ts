import { DatabaseState } from './types';

const DB_STORAGE_KEY = 'scoolmeet_mysql_full_state_v2';

/**
 * Default Seed State mirroring the MySQL Database (database/schema.sql)
 * Default Admin Account:
 *   Phone: 09120000000
 *   Password: admin1234
 */
const INITIAL_DB_STATE: DatabaseState = {
  admin: {
    firstName: 'روزبه',
    lastName: 'توکلی',
    phone: '09120000000',
    email: 'admin@scoolmeet.ir',
    roleTitle: 'مدیر سامانه و مدرس دوره',
    bio: 'مدرس و مدیر آموزشی پلتفرم اسکول میت — مدیریت یکپارچه کلاس‌های ۹۰۱، ۹۰۲ و ۹۰۳، بررسی تکالیف و پشتیبانی مستمر دانش‌آموزان.',
    password: 'admin1234',
  },
  classes: [
    {
      code: '901',
      title: 'کلاس ۹۰۱ — ریاضی و الگوریتم پیشرفته',
      gradeLevel: 'پایه نهم · گروه الف',
      instructorName: 'استاد روزبه توکلی',
      capacity: 30,
      roomOrLink: 'اتاق ۳۰۱ / تالار آنلاین اول',
      scheduleSummary: 'شنبه‌ها و دوشنبه‌ها · ساعت ۱۶:۰۰ تا ۱۷:۳۰',
      description:
        'تمرکز این کلاس بر پایه منطق ریاضی، تحلیل مسئله، رسم فلوچارت و طراحی الگوریتم‌های استاندارد است.',
    },
    {
      code: '902',
      title: 'کلاس ۹۰۲ — برنامه‌نویسی و علوم کامپیوتر',
      gradeLevel: 'پایه نهم · گروه ب',
      instructorName: 'استاد روزبه توکلی',
      capacity: 30,
      roomOrLink: 'کارگاه کامپیوتر ۲ / تالار آنلاین دوم',
      scheduleSummary: 'یکشنبه‌ها و سه‌شنبه‌ها · ساعت ۱۶:۰۰ تا ۱۷:۳۰',
      description:
        'آموزش عملی ساختار داده‌ها، مبانی برنامه‌نویسی ساخت‌یافته، منطق شرطی و پیاده‌سازی پروژه‌های کارگاهی.',
    },
    {
      code: '903',
      title: 'کلاس ۹۰۳ — المپیاد و حل تمرین تخصصی',
      gradeLevel: 'پایه نهم · گروه ج',
      instructorName: 'استاد روزبه توکلی',
      capacity: 25,
      roomOrLink: 'اتاق ۳۰۵ / تالار آنلاین سوم',
      scheduleSummary: 'چهارشنبه‌ها · ساعت ۱۵:۳۰ تا ۱۸:۰۰',
      description:
        'حل مسائل ترکیبیاتی، نظریه اعداد، استدلال ریاضی و آمادگی کامل برای آزمون‌های پیشرفت تحصیلی.',
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
      nationalCode: '0023456789',
      parentPhone: '09123334455',
      notes: 'دانش‌آموز منظم و فعال در حل مسائل الگوریتم.',
      createdAt: '۱۴۰۵/۰۸/۰۱',
    },
    {
      id: 102,
      firstName: 'سارا',
      lastName: 'محمدی',
      phone: '09122223344',
      classCode: '901',
      status: 'approved',
      nationalCode: '0029876543',
      parentPhone: '09124445566',
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
      nationalCode: '0031122334',
      parentPhone: '09125556677',
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
      nationalCode: '0034455667',
      parentPhone: '09126667788',
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
      nationalCode: '0045566778',
      parentPhone: '09127778899',
      notes: 'عضو تیم المپیاد ریاضی کلاس ۹۰۳.',
      createdAt: '۱۴۰۵/۰۸/۰۴',
    },
    {
      id: 106,
      firstName: 'هلیا',
      lastName: 'موسوی',
      phone: '09126667788',
      classCode: '903',
      status: 'pending',
      nationalCode: '0048899001',
      parentPhone: '09128889900',
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
      nationalCode: '0051234567',
      parentPhone: '09129990011',
      notes: 'ثبت‌نام جدید کلاس ۹۰۱.',
      createdAt: '۱۴۰۵/۰۸/۱۴',
    },
  ],
  assignments: [
    {
      id: 201,
      title: 'تمرین اول: طراحی فلوچارت و الگوریتم مسیریابی',
      description:
        'الگوریتم تشخیص اعداد اول و رسم فلوچارت کامل آن را به صورت مستند PDF یا تصویر واضح ارسال نمایید.',
      classCode: '901',
      dueDate: '۱۴۰۵/۰۸/۲۰ · ساعت ۱۸:۰۰',
      maxScore: 20,
      attachmentName: 'tamrin-1-algorithm-901.pdf',
      status: 'active',
      createdAt: '۱۴۰۵/۰۸/۱۰',
    },
    {
      id: 202,
      title: 'پروژه عملی: پیاده‌سازی ساختار شرطی و حلقه‌ها',
      description:
        'کدهای مربوط به تمرین صفحه ۲۴ جزوه برنامه‌نویسی را به همراه خروجی اجرای برنامه در قالب یک فایل ارسال کنید.',
      classCode: '902',
      dueDate: '۱۴۰۵/۰۸/۲۲ · ساعت ۲۳:۵۹',
      maxScore: 20,
      attachmentName: 'project-loops-902.zip',
      status: 'active',
      createdAt: '۱۴۰۵/۰۸/۱۱',
    },
    {
      id: 203,
      title: 'سری سوالات ترکیبیات و اصل لانه‌کبوتر',
      description:
        'پاسخ تشریحی ۵ سوال اول بخش ترکیبیات را با استدلال کامل ریاضی نوشته و فایل آن را بارگذاری نمایید.',
      classCode: '903',
      dueDate: '۱۴۰۵/۰۸/۲۵ · ساعت ۲۰:۰۰',
      maxScore: 20,
      attachmentName: 'olympiad-set-3-903.pdf',
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
      fileName: 'amirhossein-flowchart-901.pdf',
      fileContent:
        'گام ۱: دریافت عدد صحیح n از ورودی.\nگام ۲: بررسی بخش‌پذیری بر اعداد ۲ تا جذر n.\nگام ۳: در صورت عدم وجود مقسوم‌علیه، چاپ «عدد اول است».\nفلوچارت کامل به همراه جدول ارزش‌گذاری متغیرها پیوست شده است.',
      submittedAt: '۱۴۰۵/۰۸/۱۳ · ۱۵:۴۰',
      score: null,
      teacherFeedback: '',
      status: 'pending',
    },
    {
      id: 302,
      assignmentId: 201,
      studentId: 102,
      studentName: 'سارا محمدی',
      classCode: '901',
      fileName: 'sara-mohammadi-hw1.pdf',
      fileContent:
        'تحلیل پیچیدگی زمانی الگوریتم به همراه رسم دیاگرام تصمیم‌گیری و ۳ مثال عددی برای اعداد ۱۷، ۴۹ و ۹۷.',
      submittedAt: '۱۴۰۵/۰۸/۱۲ · ۱۹:۱۵',
      score: 19.5,
      teacherFeedback: 'بسیار دقیق و منظم نوشته شده است. در شرط حلقه می‌توانستید اعداد زوج را از ابتدا کنار بگذارید.',
      status: 'graded',
    },
    {
      id: 303,
      assignmentId: 202,
      studentId: 103,
      studentName: 'محمدمهدی کریمی',
      classCode: '902',
      fileName: 'karimi-loops-project.pdf',
      fileContent:
        'پیاده‌سازی کامل حلقه for و while برای محاسبه مجموع دنباله حسابی و بررسی شرط خروج اضطراری.',
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
      fileName: 'kian-combinatorics-solutions.pdf',
      fileContent:
        'اثبات کامل سوالات ۱ تا ۵ با استفاده از اصل شمول و عدم شمول و اصل لانه‌کبوتر تعمیم‌یافته.',
      submittedAt: '۱۴۰۵/۰۸/۱۴ · ۱۴:۰۵',
      score: null,
      teacherFeedback: '',
      status: 'pending',
    },
  ],
  schedules: [
    {
      id: 401,
      classCode: '901',
      dayOfWeek: 'شنبه',
      startTime: '۱۶:۰۰',
      endTime: '۱۷:۳۰',
      topic: 'مبانی الگوریتم و فلوچارت‌های شرطی',
      sessionType: 'حضوری',
      locationOrLink: 'اتاق ۳۰۱',
    },
    {
      id: 402,
      classCode: '901',
      dayOfWeek: 'دوشنبه',
      startTime: '۱۶:۰۰',
      endTime: '۱۷:۳۰',
      topic: 'کارگاه حل تمرین و بررسی تکالیف هفتگی',
      sessionType: 'آنلاین',
      locationOrLink: 'تالار مجازی کلاس ۹۰۱',
    },
    {
      id: 403,
      classCode: '902',
      dayOfWeek: 'یکشنبه',
      startTime: '۱۶:۰۰',
      endTime: '۱۷:۳۰',
      topic: 'ساختارهای تکرار و آرایه‌ها در برنامه‌نویسی',
      sessionType: 'حضوری',
      locationOrLink: 'کارگاه کامپیوتر ۲',
    },
    {
      id: 404,
      classCode: '902',
      dayOfWeek: 'سه‌شنبه',
      startTime: '۱۶:۰۰',
      endTime: '۱۷:۳۰',
      topic: 'پروژه عملی گروهی و رفع اشکال کدها',
      sessionType: 'آنلاین',
      locationOrLink: 'تالار مجازی کلاس ۹۰۲',
    },
    {
      id: 405,
      classCode: '903',
      dayOfWeek: 'چهارشنبه',
      startTime: '۱۵:۳۰',
      endTime: '۱۸:۰۰',
      topic: 'ترکیبیات پیشرفته و شبیه‌سازی آزمون المپیاد',
      sessionType: 'آزمون و حل تمرین',
      locationOrLink: 'اتاق ۳۰۵',
    },
  ],
  resources: [
    {
      id: 501,
      title: 'جزوه جامع طراحی الگوریتم و فلوچارت (فصل ۱ تا ۳)',
      category: 'جزوه PDF',
      classCode: '901',
      urlOrFileName: 'algorithm-booklet-901.pdf',
      fileSize: '۳.۸ مگابایت',
      description: 'شامل درس‌نامه کامل به همراه ۴۰ مثال حل‌شده برای دانش‌آموزان کلاس ۹۰۱.',
      createdAt: '۱۴۰۵/۰۸/۰۵',
    },
    {
      id: 502,
      title: 'فایل تمرین‌های کارگاهی برنامه‌نویسی ساخت‌یافته',
      category: 'فایل تمرین',
      classCode: '902',
      urlOrFileName: 'coding-lab-exercises-902.zip',
      fileSize: '۵.۲ مگابایت',
      description: 'مجموعه نمونه کدهای استاندارد و قالب پروژه‌های عملی کلاس ۹۰۲.',
      createdAt: '۱۴۰۵/۰۸/۰۷',
    },
    {
      id: 503,
      title: 'بانک سوالات المپیاد ریاضی و کامپیوتر با پاسخ تشریحی',
      category: 'جزوه PDF',
      classCode: '903',
      urlOrFileName: 'olympiad-bank-903.pdf',
      fileSize: '۶.۱ مگابایت',
      description: 'منتخب سوالات ۵ دوره اخیر همراه با نکات کلیدی حل سریع ویژه کلاس ۹۰۳.',
      createdAt: '۱۴۰۵/۰۸/۰۹',
    },
    {
      id: 504,
      title: 'راهنمای استاندارد ارسال تکالیف در سامانه اسکول میت',
      category: 'لینک آموزشی',
      classCode: 'all',
      urlOrFileName: 'https://scoolmeet.ir/guide/homework-submission',
      fileSize: 'لینک مستقیم',
      description: 'مشترک برای هر سه کلاس ۹۰۱، ۹۰۲ و ۹۰۳ جهت آشنایی با نحوه نام‌گذاری و بارگذاری فایل‌ها.',
      createdAt: '۱۴۰۵/۰۸/۰۱',
    },
  ],
  announcements: [
    {
      id: 601,
      title: 'برگزاری آزمونک میان‌ترم در هفته آینده',
      content:
        'به اطلاع کلیه دانش‌آموزان کلاس‌های ۹۰۱، ۹۰۲ و ۹۰۳ می‌رساند آزمونک ارزیابی مستمر در ابتدای جلسه اول هفته آینده برگزار خواهد شد. مطالعه جزوات بارگذاری‌شده در بخش منابع آموزشی الزامی است.',
      targetClasses: 'all',
      priority: 'مهم',
      createdAt: '۱۴۰۵/۰۸/۱۲ · ۱۰:۳۰',
    },
    {
      id: 602,
      title: 'تمدید مهلت ارسال تمرین فلوچارت ویژه کلاس ۹۰۱',
      content:
        'مهلت بارگذاری فایل تمرین اول کلاس ۹۰۱ تا روز چهارشنبه ساعت ۱۸:۰۰ تمدید گردید. لطفاً فایل خود را در قالب PDF ارسال نمایید.',
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
      subject: 'سوال در مورد رسم حلقه تکرار در تمرین اول فلوچارت',
      priority: 'مهم',
      status: 'در انتظار پاسخ',
      createdAt: '۱۴۰۵/۰۸/۱۴ · ۰۹:۴۵',
      messages: [
        {
          id: 1,
          senderRole: 'student',
          senderName: 'امیرحسین رضایی',
          message:
            'سلام استاد وقت بخیر. در سوال سوم تمرین الگوریتم، آیا می‌توانیم شرط پایان حلقه را بر اساس جذر عدد ورودی قرار دهیم؟',
          sentAt: '۱۴۰۵/۰۸/۱۴ · ۰۹:۴۵',
        },
      ],
    },
    {
      id: 702,
      studentId: 103,
      studentName: 'محمدمهدی کریمی',
      studentPhone: '09123334455',
      classCode: '902',
      subject: 'درخواست فایل ضبط‌شده جلسه یکشنبه کلاس ۹۰۲',
      priority: 'عادی',
      status: 'در انتظار پاسخ',
      createdAt: '۱۴۰۵/۰۸/۱۴ · ۱۲:۱۰',
      messages: [
        {
          id: 1,
          senderRole: 'student',
          senderName: 'محمدمهدی کریمی',
          message:
            'سلام استاد، ممنون می‌شوم فایل تمرین‌های حل‌شده در کارگاه روز یکشنبه را در بخش منابع آموزشی قرار دهید.',
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
      subject: 'هماهنگی جهت شرکت در جلسه حل تمرین المپیاد',
      priority: 'عادی',
      status: 'پاسخ داده شده',
      createdAt: '۱۴۰۵/۰۸/۱۱ · ۱۸:۲۰',
      messages: [
        {
          id: 1,
          senderRole: 'student',
          senderName: 'کیان صادقی',
          message: 'سلام استاد، آیا جلسه چهارشنبه کلاس ۹۰۳ به صورت حضوری در اتاق ۳۰۵ برگزار می‌شود؟',
          sentAt: '۱۴۰۵/۰۸/۱۱ · ۱۸:۲۰',
        },
        {
          id: 2,
          senderRole: 'admin',
          senderName: 'استاد روزبه توکلی',
          message:
            'سلام کیان عزیز، بله جلسه چهارشنبه رأس ساعت ۱۵:۳۰ در اتاق ۳۰۵ برگزار خواهد شد و برگه سوالات در کلاس توزیع می‌شود.',
          sentAt: '۱۴۰۵/۰۸/۱۱ · ۱۹:۰۵',
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
      detail: 'فایل kian-combinatorics-solutions.pdf برای تصحیح بارگذاری شد.',
      timeAgo: '۱ ساعت پیش',
      category: 'assignment',
    },
    {
      id: 803,
      title: 'ثبت تیکت جدید توسط امیرحسین رضایی (کلاس ۹۰۱)',
      detail: 'موضوع: سوال در مورد رسم حلقه تکرار در تمرین اول فلوچارت.',
      timeAgo: '۲ ساعت پیش',
      category: 'ticket',
    },
    {
      id: 804,
      title: 'ارسال اطلاعیه عمومی به هر سه کلاس ۹۰۱، ۹۰۲ و ۹۰۳',
      detail: 'عنوان اطلاعیه: برگزاری آزمونک میان‌ترم در هفته آینده.',
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
