const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  searchMember: (query) => ipcRenderer.invoke('searchMember', query),
  processMembershipPayment: (paymentDetails) => ipcRenderer.invoke('processMembershipPayment', paymentDetails),
  getMemberStatus: (memberId) => ipcRenderer.invoke('getMemberStatus', memberId),
  getShiftSummary: () => ipcRenderer.invoke('getShiftSummary'),
  closeShift: (shiftData) => ipcRenderer.invoke('closeShift', shiftData)
});
