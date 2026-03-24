export const providerCreateDefaults = {
  serviceType: 'CHILD_CARE',
  zipcode: '02451',
  howDidYouHearAboutUs: 'TV',
  referrerCookie: '',
};

export const providerNameUpdateInput = {
  firstName: 'Harvey',
  lastName: 'Zellarzi',
};

export const saveMultipleVerticalsInput = {
  serviceIds: ['PETCAREXX', 'HOUSEKEEP', 'SENIRCARE', 'TUTORINGX'],
  test: 'mv_PTA',
  testVariance: 'mv_unlimited_PTA',
};

export const caregiverAttributesUpdateInput = {
  childcare: {
    ageGroups: ['NEWBORN', 'EARLY_SCHOOL', 'TODDLER', 'ELEMENTARY_SCHOOL'],
    numberOfChildren: 2,
  },
  serviceType: 'CHILD_CARE',
};

export const providerJobInterestUpdateInput = {
  source: 'ENROLLMENT',
  serviceType: 'CHILD_CARE',
  recurringJobInterest: {
    jobRate: {
      maximum: { amount: '21', currencyCode: 'USD' },
      minimum: { amount: '14', currencyCode: 'USD' },
    },
  },
};

export const universalProviderAttributesUpdateInput = {
  education: 'SOME_COLLEGE',
  languages: ['ENGLISH', 'FRENCH', 'SPANISH'],
  qualities: ['COMFORTABLE_WITH_PETS', 'OWN_TRANSPORTATION'],
  vaccinated: true,
};

export const providerUniversalAvailabilityInput = {
  daysOfWeek: ['THURSDAY', 'TUESDAY', 'MONDAY', 'SUNDAY', 'WEDNESDAY'],
  timesOfDay: ['AFTERNOONS', 'EVENINGS', 'MORNINGS'],
};

export const providerBiographyInput = {
  experienceSummary:
    'I have 3 year of experience. I can help with caregiver. I have some other experience as well.I have 3 year of experience. I can help with caregiver. I have some other experience as well.',
  serviceType: 'CHILD_CARE',
  title:
    'I have 3 year of experience. I can help with caregiver. I have some other experience as well.',
};

export const caregiverAttributesSecondUpdateInput = {
  caregiver: {
    comfortableWithPets: true,
    covidVaccinated: true,
    education: 'SOME_HIGH_SCHOOL',
    languages: ['ENGLISH', 'FRENCH', 'SPANISH'],
    ownTransportation: true,
    smokes: true,
    yearsOfExperience: 3,
  },
  childcare: {
    ageGroups: null,
    careForSickChild: false,
    carpooling: true,
    certifiedNursingAssistant: false,
    certifiedRegistedNurse: false,
    certifiedTeacher: true,
    childDevelopmentAssociate: false,
    cprTrained: true,
    craftAssistance: false,
    doula: false,
    earlyChildDevelopmentCoursework: true,
    earlyChildhoodEducation: false,
    errands: true,
    expSpecialNeedsChildren: false,
    experienceWithTwins: false,
    firstAidTraining: true,
    groceryShopping: true,
    laundryAssistance: true,
    lightHousekeeping: true,
    mealPreparation: true,
    nafccCertified: false,
    trustlineCertifiedCalifornia: false,
    travel: true,
    swimmingSupervision: true,
    remoteLearningAssistance: false,
    numberOfChildren: 1,
  },
  serviceType: 'CHILD_CARE',
};

export const notificationSettingCreateInput = {
  domain: 'PROVIDER_SCREENING',
  phoneNumber: '+17817956755',
  type: 'SMS',
};

export const pricingConfig = {
  premium: {
    pricingSchemeId: 'JUN231',
    pricingPlanId: 'JUN231001',
    promoCode: 'SYSTEM$4DISCOUNT',
  },
  basic: {
    pricingSchemeId: 'PROVIDER_PAID_BASIC3',
    pricingPlanId: 'PROVIDER_PAID_BASIC3_001',
    promoCode: '',
  },
};

export const p2pStripeAccountInput = {
  firstName: 'Harvey',
  lastName: 'Zellarzi',
  addressLine1: '201 Jones road',
  dateOfBirth: '1973-08-26',
  lastFourSSN: '1111',
  city: 'Waltham',
  state: 'MA',
  zip: '02451',
};

export const legalInfoInput = {
  gender: 'M',
  dateOfBirth: '10/10/1990',
  screenName: 'Name',
  firstName: 'Harvey',
  middleName: 'Ks',
  lastName: 'Zellarzi',
};

export const legalAddressInput = {
  addressLine1: '201 Jones road',
  addressLine2: '100th street',
  screenName: 'Address',
  zip: '02451',
  city: 'Waltham',
  state: 'MA',
};

export const ssnInput = {
  ssn: '773011779',
  ssnInfoAccepted: '1',
};
