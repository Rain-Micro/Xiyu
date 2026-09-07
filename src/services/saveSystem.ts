// 保存文件系统
export class SaveSystem {
  private basePath: string = 'D:\\Project human\\Save'
  private emergencyPath: string = 'D:\\Project human\\emergency'

  setBasePath(path: string) {
    this.basePath = path
  }

  getBasePath(): string {
    return this.basePath
  }

  getEmergencyPath(): string {
    return this.emergencyPath
  }

  setEmergencyPath(path: string) {
    this.emergencyPath = path
  }

  // 创建保存文件夹
  // 格式：名字_年月日_时分
  createSaveFolder(name: string): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hour = String(now.getHours()).padStart(2, '0')
    const minute = String(now.getMinutes()).padStart(2, '0')
    const folderName = `${name}_${year}${month}${day}_${hour}:${minute}`
    return `${this.basePath}\\${folderName}`
  }

  // 保存数据到文件（使用localStorage模拟）
  saveData(key: string, data: any) {
    try {
      localStorage.setItem(`save_${key}`, JSON.stringify(data))
      return true
    } catch {
      return false
    }
  }

  // 读取保存的数据
  loadData(key: string): any | null {
    try {
      const data = localStorage.getItem(`save_${key}`)
      return data ? JSON.parse(data) : null
    } catch {
      return null
    }
  }

  // 迁移旧保存路径到新路径
  migrateData(fromPath: string, toPath: string): boolean {
    // Demo阶段：在localStorage中标记迁移状态
    try {
      localStorage.setItem('save_migrated', JSON.stringify({ from: fromPath, to: toPath, time: Date.now() }))
      return true
    } catch {
      return false
    }
  }
}

export const saveSystem = new SaveSystem()
