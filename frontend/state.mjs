export const roles = ['passenger', 'driver', 'operator', 'admin'];

export const appState = {
  currentRole: 'passenger',
  currentRegRole: 'passenger',
  isPhoneFrameView: true,
  pendingAccountType: null,
  pendingApprovalsList: [
    { id: 101, type: 'Driver', identifier: 'DL-89012345', rankCode: 'PMB-RANK-01', phone: '073 987 6543', date: '25 Aug 2026' },
    { id: 102, type: 'Operator', identifier: 'OP-KZN-004', rankCode: 'EMP-RANK-02', phone: '081 555 9922', date: '25 Aug 2026' }
  ]
};

export const demoCredentials = {
  passenger: {
    identifier: '0821234567',
    password: 'passenger123'
  },
  driver: {
    identifier: '0691234567',
    password: 'driver123'
  },
  operator: {
    identifier: '0789871234',
    password: 'operator123'
  },
  admin: {
    identifier: 'admin@temba.ac.za',
    password: 'admin123'
  }
};
