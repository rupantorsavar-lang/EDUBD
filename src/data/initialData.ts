import {
  SchoolProfile,
  ClassInfo,
  Subject,
  Student,
  Staff,
  AttendanceRecord,
  AttendanceStatus,
  Exam,
  MarksEntry,
  FeeHead,
  FeeInvoice,
  FeePayment,
  Expense,
  RoutinePeriod,
  Homework,
  AdmissionEnquiry,
  Book,
  BookIssue,
  TransportRoute,
  InventoryItem,
  Notice,
  ExamScheduleItem,
  SchoolHoliday,
  ClassFeeConfig,
  ScheduledFee,
  StudentTransport,
  WebsiteMessage,
  HomeworkSubmission,
  AttendanceRuleConfig,
  AttendanceAuditLog,
  BlogPost,
  OnlinePaymentRequest,
} from '../types';
import { DEFAULT_SCHOOL_LOGO } from './schoolLogo';

export const initialSchoolProfile: SchoolProfile = {
  id: 'school_main',
  nameEn: 'Smart School BD ERP',
  nameBn: 'স্মার্ট স্কুল বিডি ইআরপি',
  eiin: '',
  schoolCode: '',
  addressEn: 'Bangladesh',
  addressBn: 'বাংলাদেশ',
  phone: '',
  email: 'support@smartschoolbd.com',
  website: 'www.smartschoolbd.com',
  principalNameEn: '',
  principalNameBn: '',
  principalSignatureUrl: '',
  establishedYear: '2026',
  currentSession: '2026',
  logoUrl: DEFAULT_SCHOOL_LOGO,
  heroImageUrl: '',
  aboutImageUrl: '',
  heroTaglineBn: 'জ্ঞান, নৈতিকতা ও আধুনিক শিক্ষা',
  heroTaglineEn: 'Knowledge, Ethics & Modern Education',
  heroWelcomeTitleBn: 'স্বাগতম',
  heroWelcomeTitleEn: 'Welcome',
  heroSubtitleBn: 'আধুনিক শিক্ষা, নৈতিকতা ও প্রযুক্তির সমন্বয়ে গড়ে তুলছি স্মার্ট বাংলাদেশ গড়ার ভবিষ্যৎ আলোকিত প্রজন্ম।',
  heroSubtitleEn: 'Building an enlightened and skilled generation through modern education and moral values.',
  mottoBn: 'জ্ঞান • নৈতিকতা • আধুনিক শিক্ষা',
  mottoEn: 'Knowledge • Ethics • Modern Education',
  statsStudents: '0',
  statsTeachers: '0',
  statsClassrooms: '0',
  statsExperience: '0',
  currencySymbol: '৳',
  timezone: 'Asia/Dhaka',
};

export const initialClasses: ClassInfo[] = [
  { id: 'c_nursery', name: 'Nursery', nameBn: 'প্লে / নার্সারি', order: 0, sections: ['A'], shifts: ['Morning'], hasGroups: false, isActive: true },
  { id: 'c_kg', name: 'KG', nameBn: 'কেজি (KG)', order: 1, sections: ['A', 'B'], shifts: ['Morning'], hasGroups: false, isActive: true },
  { id: 'c_1', name: 'Class 1', nameBn: '1ম শ্রেণি', order: 2, sections: ['A', 'B'], shifts: ['Morning', 'Day'], hasGroups: false, isActive: true },
  { id: 'c_2', name: 'Class 2', nameBn: '2য় শ্রেণি', order: 3, sections: ['A', 'B'], shifts: ['Morning', 'Day'], hasGroups: false, isActive: true },
  { id: 'c_3', name: 'Class 3', nameBn: '3য় শ্রেণি', order: 4, sections: ['A', 'B'], shifts: ['Morning', 'Day'], hasGroups: false, isActive: true },
  { id: 'c_4', name: 'Class 4', nameBn: '4র্থ শ্রেণি', order: 5, sections: ['A', 'B'], shifts: ['Morning', 'Day'], hasGroups: false, isActive: true },
  { id: 'c_5', name: 'Class 5', nameBn: '5ম শ্রেণি', order: 6, sections: ['A', 'B'], shifts: ['Morning', 'Day'], hasGroups: false, isActive: true },
  { id: 'c_6', name: 'Class 6', nameBn: '6ষ্ঠ শ্রেণি', order: 7, sections: ['A', 'B', 'C'], shifts: ['Day'], hasGroups: false, isActive: true },
  { id: 'c_7', name: 'Class 7', nameBn: '7ম শ্রেণি', order: 8, sections: ['A', 'B', 'C'], shifts: ['Day'], hasGroups: false, isActive: true },
  { id: 'c_8', name: 'Class 8', nameBn: '8ম শ্রেণি', order: 9, sections: ['A', 'B', 'C'], shifts: ['Day'], hasGroups: false, isActive: true },
  { id: 'c_9', name: 'Class 9', nameBn: '9ম শ্রেণি', order: 10, sections: ['A', 'B', 'C'], shifts: ['Day'], hasGroups: true, isActive: true },
  { id: 'c_10', name: 'Class 10', nameBn: '10ম শ্রেণি', order: 11, sections: ['A', 'B', 'C'], shifts: ['Day'], hasGroups: true, isActive: true },
];

export const initialSubjects: Subject[] = [
  // Nursery
  { id: 'sub_nur_ban', code: '001', nameEn: 'Bangla (Oral & Writing)', nameBn: 'বাংলা (মৌখিক ও লিখন)', className: 'Nursery', fullMarks: 50, passMarks: 17, writtenMarks: 35, oralMarks: 15 },
  { id: 'sub_nur_eng', code: '002', nameEn: 'English (Alphabet & Rhymes)', nameBn: 'ইংরেজি (বর্ণমালা ও ছড়া)', className: 'Nursery', fullMarks: 50, passMarks: 17, writtenMarks: 35, oralMarks: 15 },
  { id: 'sub_nur_mat', code: '003', nameEn: 'Elementary Mathematics', nameBn: 'প্রাথমিক গণিত', className: 'Nursery', fullMarks: 50, passMarks: 17, writtenMarks: 35, oralMarks: 15 },
  { id: 'sub_nur_art', code: '004', nameEn: 'Drawing & Coloring', nameBn: 'অঙ্কন ও রঙ করা', className: 'Nursery', fullMarks: 50, passMarks: 17, writtenMarks: 50 },

  // KG
  { id: 'sub_kg_ban', code: '011', nameEn: 'Bangla Sahitto', nameBn: 'বাংলা সাহিত্য', className: 'KG', fullMarks: 100, passMarks: 33, writtenMarks: 70, oralMarks: 30 },
  { id: 'sub_kg_eng', code: '012', nameEn: 'English For Today & Rhymes', nameBn: 'ইংরেজি ও রাইমস', className: 'KG', fullMarks: 100, passMarks: 33, writtenMarks: 70, oralMarks: 30 },
  { id: 'sub_kg_mat', code: '013', nameEn: 'Mathematics & Mental Math', nameBn: 'গণিত ও নামতা', className: 'KG', fullMarks: 100, passMarks: 33, writtenMarks: 80, oralMarks: 20 },
  { id: 'sub_kg_gk', code: '014', nameEn: 'General Knowledge & Arabic/Moral', nameBn: 'সাধারণ জ্ঞান ও নৈতিক শিক্ষা', className: 'KG', fullMarks: 50, passMarks: 17, writtenMarks: 30, oralMarks: 20 },
  { id: 'sub_kg_art', code: '015', nameEn: 'Art & Craft', nameBn: 'চিত্রাঙ্কন', className: 'KG', fullMarks: 50, passMarks: 17, writtenMarks: 50 },

  // Class 1
  { id: 'sub_1_ban', code: '101', nameEn: 'Amar Bangla Boi', nameBn: 'আমার বাংলা বই', className: 'Class 1', fullMarks: 100, passMarks: 33, writtenMarks: 80, oralMarks: 20 },
  { id: 'sub_1_eng', code: '102', nameEn: 'English For Today', nameBn: 'ইংলিশ ফর টুডে', className: 'Class 1', fullMarks: 100, passMarks: 33, writtenMarks: 80, oralMarks: 20 },
  { id: 'sub_1_mat', code: '103', nameEn: 'Prathomik Gonit', nameBn: 'প্রাথমিক গণিত', className: 'Class 1', fullMarks: 100, passMarks: 33, writtenMarks: 100 },

  // Class 2
  { id: 'sub_2_ban', code: '201', nameEn: 'Amar Bangla Boi', nameBn: 'আমার বাংলা বই', className: 'Class 2', fullMarks: 100, passMarks: 33, writtenMarks: 80, oralMarks: 20 },
  { id: 'sub_2_eng', code: '202', nameEn: 'English For Today', nameBn: 'ইংলিশ ফর টুডে', className: 'Class 2', fullMarks: 100, passMarks: 33, writtenMarks: 80, oralMarks: 20 },
  { id: 'sub_2_mat', code: '203', nameEn: 'Prathomik Gonit', nameBn: 'প্রাথমিক গণিত', className: 'Class 2', fullMarks: 100, passMarks: 33, writtenMarks: 100 },

  // Class 3
  { id: 'sub_3_ban', code: '301', nameEn: 'Bangla', nameBn: 'বাংলা', className: 'Class 3', fullMarks: 100, passMarks: 33, writtenMarks: 100 },
  { id: 'sub_3_eng', code: '302', nameEn: 'English', nameBn: 'ইংরেজি', className: 'Class 3', fullMarks: 100, passMarks: 33, writtenMarks: 100 },
  { id: 'sub_3_mat', code: '303', nameEn: 'Mathematics', nameBn: 'প্রাথমিক গণিত', className: 'Class 3', fullMarks: 100, passMarks: 33, writtenMarks: 100 },
  { id: 'sub_3_sci', code: '304', nameEn: 'General Science', nameBn: 'প্রাথমিক বিজ্ঞান', className: 'Class 3', fullMarks: 100, passMarks: 33, writtenMarks: 100 },
  { id: 'sub_3_bgs', code: '305', nameEn: 'Bangladesh & Global Studies', nameBn: 'বাংলাদেশ ও বিশ্বপরিচয়', className: 'Class 3', fullMarks: 100, passMarks: 33, writtenMarks: 100 },
  { id: 'sub_3_rel', code: '306', nameEn: 'Religion & Moral Education', nameBn: 'ধর্ম ও নৈতিক শিক্ষা', className: 'Class 3', fullMarks: 100, passMarks: 33, writtenMarks: 100 },

  // Class 4
  { id: 'sub_4_ban', code: '401', nameEn: 'Bangla', nameBn: 'বাংলা', className: 'Class 4', fullMarks: 100, passMarks: 33, writtenMarks: 100 },
  { id: 'sub_4_eng', code: '402', nameEn: 'English', nameBn: 'ইংরেজি', className: 'Class 4', fullMarks: 100, passMarks: 33, writtenMarks: 100 },
  { id: 'sub_4_mat', code: '403', nameEn: 'Mathematics', nameBn: 'প্রাথমিক গণিত', className: 'Class 4', fullMarks: 100, passMarks: 33, writtenMarks: 100 },
  { id: 'sub_4_sci', code: '404', nameEn: 'General Science', nameBn: 'প্রাথমিক বিজ্ঞান', className: 'Class 4', fullMarks: 100, passMarks: 33, writtenMarks: 100 },
  { id: 'sub_4_bgs', code: '405', nameEn: 'Bangladesh & Global Studies', nameBn: 'বাংলাদেশ ও বিশ্বপরিচয়', className: 'Class 4', fullMarks: 100, passMarks: 33, writtenMarks: 100 },
  { id: 'sub_4_rel', code: '406', nameEn: 'Religion & Moral Education', nameBn: 'ধর্ম ও নৈতিক শিক্ষা', className: 'Class 4', fullMarks: 100, passMarks: 33, writtenMarks: 100 },

  // Class 5
  { id: 'sub_5_ban', code: '501', nameEn: 'Bangla', nameBn: 'বাংলা', className: 'Class 5', fullMarks: 100, passMarks: 33, writtenMarks: 100 },
  { id: 'sub_5_eng', code: '502', nameEn: 'English', nameBn: 'ইংরেজি', className: 'Class 5', fullMarks: 100, passMarks: 33, writtenMarks: 100 },
  { id: 'sub_5_mat', code: '503', nameEn: 'Mathematics', nameBn: 'প্রাথমিক গণিত', className: 'Class 5', fullMarks: 100, passMarks: 33, writtenMarks: 100 },
  { id: 'sub_5_sci', code: '504', nameEn: 'General Science', nameBn: 'প্রাথমিক বিজ্ঞান', className: 'Class 5', fullMarks: 100, passMarks: 33, writtenMarks: 100 },
  { id: 'sub_5_bgs', code: '505', nameEn: 'Bangladesh & Global Studies', nameBn: 'বাংলাদেশ ও বিশ্বপরিচয়', className: 'Class 5', fullMarks: 100, passMarks: 33, writtenMarks: 100 },
  { id: 'sub_5_rel', code: '506', nameEn: 'Religion & Moral Education', nameBn: 'ধর্ম ও নৈতিক শিক্ষা', className: 'Class 5', fullMarks: 100, passMarks: 33, writtenMarks: 100 },

  // Class 6 General
  { id: 'sub_6_ban', code: '061', nameEn: 'Bangla', nameBn: 'বাংলা', className: 'Class 6', fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },
  { id: 'sub_6_eng', code: '062', nameEn: 'English', nameBn: 'ইংরেজি', className: 'Class 6', fullMarks: 100, passMarks: 33, writtenMarks: 100 },
  { id: 'sub_6_mat', code: '063', nameEn: 'Mathematics', nameBn: 'গণিত', className: 'Class 6', fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },
  { id: 'sub_6_sci', code: '064', nameEn: 'General Science', nameBn: 'বিজ্ঞান (অনুসন্ধানী ও অনুশীলন)', className: 'Class 6', fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },
  { id: 'sub_6_bgs', code: '065', nameEn: 'History & Social Science', nameBn: 'ইতিহাস ও সামাজিক বিজ্ঞান', className: 'Class 6', fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },
  { id: 'sub_6_ict', code: '066', nameEn: 'Digital Technology', nameBn: 'ডিজিটাল প্রযুক্তি', className: 'Class 6', fullMarks: 100, passMarks: 33, writtenMarks: 100 },

  // Class 7
  { id: 'sub_7_ban', code: '071', nameEn: 'Bangla', nameBn: 'বাংলা', className: 'Class 7', fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },
  { id: 'sub_7_eng', code: '072', nameEn: 'English', nameBn: 'ইংরেজি', className: 'Class 7', fullMarks: 100, passMarks: 33, writtenMarks: 100 },
  { id: 'sub_7_mat', code: '073', nameEn: 'Mathematics', nameBn: 'গণিত', className: 'Class 7', fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },
  { id: 'sub_7_sci', code: '074', nameEn: 'General Science', nameBn: 'বিজ্ঞান', className: 'Class 7', fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },
  { id: 'sub_7_bgs', code: '075', nameEn: 'History & Social Science', nameBn: 'ইতিহাস ও সামাজিক বিজ্ঞান', className: 'Class 7', fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },

  // Class 8
  { id: 'sub_8_ban', code: '081', nameEn: 'Bangla', nameBn: 'বাংলা', className: 'Class 8', fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },
  { id: 'sub_8_eng', code: '082', nameEn: 'English', nameBn: 'ইংরেজি', className: 'Class 8', fullMarks: 100, passMarks: 33, writtenMarks: 100 },
  { id: 'sub_8_mat', code: '083', nameEn: 'Mathematics', nameBn: 'গণিত', className: 'Class 8', fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },
  { id: 'sub_8_sci', code: '084', nameEn: 'General Science', nameBn: 'বিজ্ঞান', className: 'Class 8', fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },
  { id: 'sub_8_bgs', code: '085', nameEn: 'Bangladesh & Global Studies', nameBn: 'বাংলাদেশ ও বিশ্বপরিচয়', className: 'Class 8', fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },

  // Class 9 Compulsory & Science
  { id: 'sub_9_ban', code: '101', nameEn: 'Bangla 1st Paper', nameBn: 'বাংলা 1ম পত্র', className: 'Class 9', fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },
  { id: 'sub_9_eng', code: '107', nameEn: 'English 1st Paper', nameBn: 'ইংরেজি 1ম পত্র', className: 'Class 9', fullMarks: 100, passMarks: 33, writtenMarks: 100 },
  { id: 'sub_9_mat', code: '109', nameEn: 'General Mathematics', nameBn: 'সাধারণ গণিত', className: 'Class 9', fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },
  { id: 'sub_9_bgs', code: '150', nameEn: 'Bangladesh & Global Studies', nameBn: 'বাংলাদেশ ও বিশ্বপরিচয়', className: 'Class 9', fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },
  { id: 'sub_9_ict', code: '154', nameEn: 'ICT', nameBn: 'তথ্য ও যোগাযোগ প্রযুক্তি', className: 'Class 9', fullMarks: 50, passMarks: 17, writtenMarks: 25, practicalMarks: 25 },
  // Class 9 Science
  { id: 'sub_9_phy', code: '136', nameEn: 'Physics', nameBn: 'পদার্থবিজ্ঞান', className: 'Class 9', group: 'Science', fullMarks: 100, passMarks: 33, writtenMarks: 50, mcqMarks: 25, practicalMarks: 25 },
  { id: 'sub_9_che', code: '137', nameEn: 'Chemistry', nameBn: 'রসায়ন', className: 'Class 9', group: 'Science', fullMarks: 100, passMarks: 33, writtenMarks: 50, mcqMarks: 25, practicalMarks: 25 },
  { id: 'sub_9_bio', code: '138', nameEn: 'Biology', nameBn: 'জীববিজ্ঞান', className: 'Class 9', group: 'Science', fullMarks: 100, passMarks: 33, writtenMarks: 50, mcqMarks: 25, practicalMarks: 25 },
  { id: 'sub_9_hmt', code: '126', nameEn: 'Higher Mathematics', nameBn: 'উচ্চতর গণিত', className: 'Class 9', group: 'Science', fullMarks: 100, passMarks: 33, writtenMarks: 50, mcqMarks: 25, practicalMarks: 25 },
  // Class 9 Business Studies / Commerce
  { id: 'sub_9_acc', code: '146', nameEn: 'Accounting', nameBn: 'হিসাববিজ্ঞান', className: 'Class 9', group: 'Commerce', fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },
  { id: 'sub_9_fin', code: '152', nameEn: 'Finance & Banking', nameBn: 'ফিন্যান্স ও ব্যাংকিং', className: 'Class 9', group: 'Commerce', fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },
  { id: 'sub_9_bue', code: '143', nameEn: 'Business Entrepreneurship', nameBn: 'ব্যবসায় উদ্যোগ', className: 'Class 9', group: 'Commerce', fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },
  // Class 9 Humanities / Arts
  { id: 'sub_9_his', code: '153', nameEn: 'History of BD & World Civilization', nameBn: 'বাংলাদেশের ইতিহাস ও বিশ্বসভ্যতা', className: 'Class 9', group: 'Humanities', fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },
  { id: 'sub_9_civ', code: '140', nameEn: 'Civics & Citizenship', nameBn: 'পৌরনীতি ও নাগরিকতা', className: 'Class 9', group: 'Humanities', fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },
  { id: 'sub_9_geo', code: '110', nameEn: 'Geography & Environment', nameBn: 'ভূগোল ও পরিবেশ', className: 'Class 9', group: 'Humanities', fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },
  // Class 9 Vocational
  { id: 'sub_9_tr1', code: '191', nameEn: 'Vocational Trade I (Electrical / IT)', nameBn: 'ট্রেড 1 (ইলেকট্রিক্যাল ও আইটি)', className: 'Class 9', group: 'Vocational', fullMarks: 100, passMarks: 33, writtenMarks: 50, mcqMarks: 25, practicalMarks: 25 },
  { id: 'sub_9_tr2', code: '192', nameEn: 'Vocational Trade II (Computer Tech)', nameBn: 'ট্রেড 2 (কম্পিউটার টেকনোলজি)', className: 'Class 9', group: 'Vocational', fullMarks: 100, passMarks: 33, writtenMarks: 50, mcqMarks: 25, practicalMarks: 25 },

  // Class 10 Compulsory
  { id: 'sub_10_ban', code: '101', nameEn: 'Bangla 1st & 2nd', nameBn: 'বাংলা 1ম ও 2য় পত্র', className: 'Class 10', fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },
  { id: 'sub_10_eng', code: '107', nameEn: 'English 1st & 2nd', nameBn: 'ইংরেজি 1ম ও 2য় পত্র', className: 'Class 10', fullMarks: 100, passMarks: 33, writtenMarks: 100 },
  { id: 'sub_10_mat', code: '109', nameEn: 'General Mathematics', nameBn: 'সাধারণ গণিত', className: 'Class 10', fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },
  { id: 'sub_10_ict', code: '154', nameEn: 'ICT', nameBn: 'তথ্য ও যোগাযোগ প্রযুক্তি', className: 'Class 10', fullMarks: 50, passMarks: 17, writtenMarks: 25, practicalMarks: 25 },
  { id: 'sub_10_bgs', code: '150', nameEn: 'Bangladesh & Global Studies', nameBn: 'বাংলাদেশ ও বিশ্বপরিচয়', className: 'Class 10', fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },
  // Class 10 Science
  { id: 'sub_10_phy', code: '136', nameEn: 'Physics', nameBn: 'পদার্থবিজ্ঞান', className: 'Class 10', group: 'Science', fullMarks: 100, passMarks: 33, writtenMarks: 50, mcqMarks: 25, practicalMarks: 25 },
  { id: 'sub_10_che', code: '137', nameEn: 'Chemistry', nameBn: 'রসায়ন', className: 'Class 10', group: 'Science', fullMarks: 100, passMarks: 33, writtenMarks: 50, mcqMarks: 25, practicalMarks: 25 },
  { id: 'sub_10_bio', code: '138', nameEn: 'Biology', nameBn: 'জীববিজ্ঞান', className: 'Class 10', group: 'Science', fullMarks: 100, passMarks: 33, writtenMarks: 50, mcqMarks: 25, practicalMarks: 25 },
  { id: 'sub_10_hmt', code: '126', nameEn: 'Higher Mathematics', nameBn: 'উচ্চতর গণিত', className: 'Class 10', group: 'Science', fullMarks: 100, passMarks: 33, writtenMarks: 50, mcqMarks: 25, practicalMarks: 25 },
  // Class 10 Business Studies / Commerce
  { id: 'sub_10_acc', code: '146', nameEn: 'Accounting', nameBn: 'হিসাববিজ্ঞান', className: 'Class 10', group: 'Commerce', fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },
  { id: 'sub_10_fin', code: '152', nameEn: 'Finance & Banking', nameBn: 'ফিন্যান্স ও ব্যাংকিং', className: 'Class 10', group: 'Commerce', fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },
  { id: 'sub_10_bue', code: '143', nameEn: 'Business Entrepreneurship', nameBn: 'ব্যবসায় উদ্যোগ', className: 'Class 10', group: 'Commerce', fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },
  // Class 10 Humanities / Arts
  { id: 'sub_10_his', code: '153', nameEn: 'History of BD & World Civilization', nameBn: 'বাংলাদেশের ইতিহাস ও বিশ্বসভ্যতা', className: 'Class 10', group: 'Humanities', fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },
  { id: 'sub_10_civ', code: '140', nameEn: 'Civics & Citizenship', nameBn: 'পৌরনীতি ও নাগরিকতা', className: 'Class 10', group: 'Humanities', fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },
  { id: 'sub_10_geo', code: '110', nameEn: 'Geography & Environment', nameBn: 'ভূগোল ও পরিবেশ', className: 'Class 10', group: 'Humanities', fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },
  // Class 10 Vocational
  { id: 'sub_10_tr1', code: '191', nameEn: 'Vocational Trade I (Electrical / IT)', nameBn: 'ট্রেড 1 (ইলেকট্রিক্যাল ও আইটি)', className: 'Class 10', group: 'Vocational', fullMarks: 100, passMarks: 33, writtenMarks: 50, mcqMarks: 25, practicalMarks: 25 },
  { id: 'sub_10_tr2', code: '192', nameEn: 'Vocational Trade II (Computer Tech)', nameBn: 'ট্রেড 2 (কম্পিউটার টেকনোলজি)', className: 'Class 10', group: 'Vocational', fullMarks: 100, passMarks: 33, writtenMarks: 50, mcqMarks: 25, practicalMarks: 25 },
];

export const initialHolidays: SchoolHoliday[] = [];

export const initialStaff: Staff[] = [];

export const initialStudents: Student[] = [];

export const initialExams: Exam[] = [];

export const initialExamRoutines: ExamScheduleItem[] = [];

export const initialMarks: MarksEntry[] = [];

export const initialFeeHeads: FeeHead[] = [
  { id: 'fh_1', nameEn: 'Monthly Tuition Fee', nameBn: 'মাসিক টিউশন ফি', code: 'TUIT', frequency: 'Monthly', defaultAmount: 1800 },
  { id: 'fh_2', nameEn: 'Admission Fee', nameBn: 'ভর্তি ফি', code: 'ADM', frequency: 'One-Time', defaultAmount: 8500 },
  { id: 'fh_3', nameEn: 'Examination Fee', nameBn: 'পরীক্ষা ফি', code: 'EXAM', frequency: 'Per-Exam', defaultAmount: 1200 },
  { id: 'fh_4', nameEn: 'Session Charge', nameBn: 'সেশন চার্জ', code: 'SESS', frequency: 'Annual', defaultAmount: 4000 },
  { id: 'fh_5', nameEn: 'Computer & Lab Fee', nameBn: 'কম্পিউটার ও ল্যাব ফি', code: 'LAB', frequency: 'Monthly', defaultAmount: 300 },
  { id: 'fh_6', nameEn: 'Transport Fee', nameBn: 'পরিবহন ফি', code: 'TRANS', frequency: 'Monthly', defaultAmount: 1500 },
];

export const initialInvoices: FeeInvoice[] = [];

export const initialPayments: FeePayment[] = [];

export const initialExpenses: Expense[] = [];

export const initialAttendance: AttendanceRecord[] = [];

export const initialOnlinePaymentRequests: OnlinePaymentRequest[] = [];

export const initialRoutines: RoutinePeriod[] = [];

export const initialHomework: Homework[] = [];

export const initialHomeworkSubmissions: HomeworkSubmission[] = [];

export const initialAttendanceRules: AttendanceRuleConfig = {
  schoolStartTime: '08:00',
  lateThresholdTime: '08:30',
  attendanceClosingTime: '10:30',
  workingDays: ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'],
  holidayDays: ['Friday'],
  allowManualCorrection: true,
  session: '2026',
  staffStartTime: '08:15',
  staffLateThresholdTime: '08:30',
  morningShiftStartTime: '07:30',
  morningShiftLateThresholdTime: '08:00',
  dayShiftStartTime: '11:30',
  dayShiftLateThresholdTime: '12:00',
  schoolDismissalTime: '13:30',
  morningShiftDismissalTime: '11:30',
  dayShiftDismissalTime: '16:00',
  duplicateCooldownMinutes: 10,
  minStayMinutesForCheckout: 15,
  classSchedules: {
    Play: { className: 'Play', shift: 'Morning', startTime: '07:45', lateThresholdTime: '08:00', dismissalTime: '09:45', closingTime: '09:30', enabled: true },
    Nurany: { className: 'Nurany', shift: 'Morning', startTime: '07:45', lateThresholdTime: '08:00', dismissalTime: '10:00', closingTime: '09:30', enabled: true },
    Nursery: { className: 'Nursery', shift: 'Morning', startTime: '07:45', lateThresholdTime: '08:00', dismissalTime: '10:00', closingTime: '09:30', enabled: true },
    KG: { className: 'KG', shift: 'Morning', startTime: '07:45', lateThresholdTime: '08:00', dismissalTime: '10:30', closingTime: '09:30', enabled: true },
    'Class 1': { className: 'Class 1', shift: 'Morning', startTime: '08:00', lateThresholdTime: '08:15', dismissalTime: '11:15', closingTime: '10:00', enabled: true },
    'Class 2': { className: 'Class 2', shift: 'Morning', startTime: '08:00', lateThresholdTime: '08:15', dismissalTime: '11:30', closingTime: '10:00', enabled: true },
    'Class 3': { className: 'Class 3', shift: 'Morning', startTime: '08:00', lateThresholdTime: '08:20', dismissalTime: '12:00', closingTime: '10:00', enabled: true },
    'Class 4': { className: 'Class 4', shift: 'Morning', startTime: '08:00', lateThresholdTime: '08:20', dismissalTime: '12:30', closingTime: '10:00', enabled: true },
    'Class 5': { className: 'Class 5', shift: 'Morning', startTime: '08:00', lateThresholdTime: '08:20', dismissalTime: '13:00', closingTime: '10:00', enabled: true },
    'Class 6': { className: 'Class 6', shift: 'Day', startTime: '11:30', lateThresholdTime: '12:00', dismissalTime: '15:00', closingTime: '13:30', enabled: true },
    'Class 7': { className: 'Class 7', shift: 'Day', startTime: '11:30', lateThresholdTime: '12:00', dismissalTime: '15:00', closingTime: '13:30', enabled: true },
    'Class 8': { className: 'Class 8', shift: 'Day', startTime: '11:30', lateThresholdTime: '12:00', dismissalTime: '15:30', closingTime: '13:30', enabled: true },
    'Class 9': { className: 'Class 9', shift: 'Day', startTime: '11:30', lateThresholdTime: '12:00', dismissalTime: '16:00', closingTime: '13:30', enabled: true },
    'Class 10': { className: 'Class 10', shift: 'Day', startTime: '11:30', lateThresholdTime: '12:00', dismissalTime: '16:00', closingTime: '13:30', enabled: true },
  },
};

export const initialAttendanceAuditLogs: AttendanceAuditLog[] = [];

export const initialBooks: Book[] = [];

export const initialBookIssues: BookIssue[] = [];

export const initialRoutes: TransportRoute[] = [];

export const initialInventory: InventoryItem[] = [];

export const initialNotices: Notice[] = [];

export const initialEnquiries: AdmissionEnquiry[] = [];

export const initialClassFeeConfigs: ClassFeeConfig[] = [
  {
    className: 'Nursery',
    classNameBn: 'প্লে / নার্সারি',
    tuitionFee: 400,
    sessionFee: 1500,
    examFee1stModelTest: 200,
    examFee1stSemester: 250,
    examFee2ndModelTest: 200,
    examFee2ndSemester: 250,
    examFee3rdModelTest: 200,
    examFee3rdSemester: 300,
    examFee1stTest: 200,
    examFeeModelTest: 200,
    examFeeHalfYearly: 250,
    examFeeAnnual: 300,
  },
  {
    className: 'KG',
    classNameBn: 'কেজি (KG)',
    tuitionFee: 450,
    sessionFee: 1800,
    examFee1stModelTest: 200,
    examFee1stSemester: 250,
    examFee2ndModelTest: 200,
    examFee2ndSemester: 250,
    examFee3rdModelTest: 200,
    examFee3rdSemester: 300,
    examFee1stTest: 200,
    examFeeModelTest: 200,
    examFeeHalfYearly: 250,
    examFeeAnnual: 300,
  },
  {
    className: 'Class 1',
    classNameBn: '1ম শ্রেণি',
    tuitionFee: 500,
    sessionFee: 2000,
    examFee1stModelTest: 250,
    examFee1stSemester: 300,
    examFee2ndModelTest: 250,
    examFee2ndSemester: 300,
    examFee3rdModelTest: 250,
    examFee3rdSemester: 350,
    examFee1stTest: 250,
    examFeeModelTest: 250,
    examFeeHalfYearly: 300,
    examFeeAnnual: 350,
  },
  {
    className: 'Class 2',
    classNameBn: '2য় শ্রেণি',
    tuitionFee: 550,
    sessionFee: 2200,
    examFee1stModelTest: 250,
    examFee1stSemester: 300,
    examFee2ndModelTest: 250,
    examFee2ndSemester: 300,
    examFee3rdModelTest: 250,
    examFee3rdSemester: 350,
    examFee1stTest: 250,
    examFeeModelTest: 250,
    examFeeHalfYearly: 300,
    examFeeAnnual: 350,
  },
  {
    className: 'Class 3',
    classNameBn: '3য় শ্রেণি',
    tuitionFee: 600,
    sessionFee: 2500,
    examFee1stModelTest: 250,
    examFee1stSemester: 350,
    examFee2ndModelTest: 250,
    examFee2ndSemester: 350,
    examFee3rdModelTest: 250,
    examFee3rdSemester: 400,
    examFee1stTest: 250,
    examFeeModelTest: 250,
    examFeeHalfYearly: 350,
    examFeeAnnual: 400,
  },
  {
    className: 'Class 4',
    classNameBn: '4র্থ শ্রেণি',
    tuitionFee: 650,
    sessionFee: 2800,
    examFee1stModelTest: 300,
    examFee1stSemester: 400,
    examFee2ndModelTest: 300,
    examFee2ndSemester: 400,
    examFee3rdModelTest: 300,
    examFee3rdSemester: 450,
    examFee1stTest: 300,
    examFeeModelTest: 300,
    examFeeHalfYearly: 400,
    examFeeAnnual: 450,
  },
  {
    className: 'Class 5',
    classNameBn: '5ম শ্রেণি',
    tuitionFee: 700,
    sessionFee: 3000,
    examFee1stModelTest: 350,
    examFee1stSemester: 450,
    examFee2ndModelTest: 350,
    examFee2ndSemester: 450,
    examFee3rdModelTest: 350,
    examFee3rdSemester: 500,
    examFee1stTest: 350,
    examFeeModelTest: 350,
    examFeeHalfYearly: 450,
    examFeeAnnual: 500,
  },
  {
    className: 'Class 6',
    classNameBn: '6ষ্ঠ শ্রেণি',
    tuitionFee: 800,
    sessionFee: 3500,
    examFee1stModelTest: 400,
    examFee1stSemester: 500,
    examFee2ndModelTest: 400,
    examFee2ndSemester: 500,
    examFee3rdModelTest: 400,
    examFee3rdSemester: 600,
    examFee1stTest: 400,
    examFeeModelTest: 400,
    examFeeHalfYearly: 500,
    examFeeAnnual: 600,
  },
  {
    className: 'Class 7',
    classNameBn: '7ম শ্রেণি',
    tuitionFee: 900,
    sessionFee: 3500,
    examFee1stModelTest: 450,
    examFee1stSemester: 550,
    examFee2ndModelTest: 450,
    examFee2ndSemester: 550,
    examFee3rdModelTest: 450,
    examFee3rdSemester: 650,
    examFee1stTest: 450,
    examFeeModelTest: 450,
    examFeeHalfYearly: 550,
    examFeeAnnual: 650,
  },
  {
    className: 'Class 8',
    classNameBn: '8ম শ্রেণি',
    tuitionFee: 1000,
    sessionFee: 4000,
    examFee1stModelTest: 500,
    examFee1stSemester: 600,
    examFee2ndModelTest: 500,
    examFee2ndSemester: 600,
    examFee3rdModelTest: 500,
    examFee3rdSemester: 700,
    examFee1stTest: 500,
    examFeeModelTest: 500,
    examFeeHalfYearly: 600,
    examFeeAnnual: 700,
  },
  {
    className: 'Class 9',
    classNameBn: '9ম শ্রেণি',
    tuitionFee: 1100,
    sessionFee: 4500,
    examFee1stModelTest: 600,
    examFee1stSemester: 700,
    examFee2ndModelTest: 600,
    examFee2ndSemester: 700,
    examFee3rdModelTest: 600,
    examFee3rdSemester: 800,
    examFee1stTest: 600,
    examFeeModelTest: 600,
    examFeeHalfYearly: 700,
    examFeeAnnual: 800,
  },
  {
    className: 'Class 10',
    classNameBn: '10ম শ্রেণি',
    tuitionFee: 1200,
    sessionFee: 5000,
    examFee1stModelTest: 700,
    examFee1stSemester: 800,
    examFee2ndModelTest: 700,
    examFee2ndSemester: 800,
    examFee3rdModelTest: 700,
    examFee3rdSemester: 900,
    examFee1stTest: 700,
    examFeeModelTest: 700,
    examFeeHalfYearly: 800,
    examFeeAnnual: 900,
  },
];

export const initialScheduledFees: ScheduledFee[] = [];

export const initialStudentTransports: StudentTransport[] = [];

export const initialWebsiteMessages: WebsiteMessage[] = [];

export const initialBlogPosts: BlogPost[] = [];

