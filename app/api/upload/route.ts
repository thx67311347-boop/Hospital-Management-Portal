import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'stream';
import fs from 'fs';
import path from 'path';
import { generateUniqueFileName, getStoragePath, FIVE_MB } from '../../lib/storage-utils';
import { ensureUploadDirExists } from '../../lib/storage-utils-server';
import { cloudStorage } from '../../lib/cloud-storage';

// 确保上传目录存在
// 注意：由于这是在模块级别调用，无法使用await
// 实际应用中，应该在POST函数内部调用
// ensureUploadDirExists();

// 分块上传相关
const CHUNK_SIZE = 3 * 1024 * 1024; // 3MB 块大小，小于Vercel的4MB限制
const TEMP_DIR_EXPIRY = 24 * 60 * 60 * 1000; // 临时文件过期时间：24小时

// 清理过期的临时文件
async function cleanupExpiredTempFiles() {
  try {
    const tempDir = path.join(process.cwd(), 'uploads', 'temp');
    if (!fs.existsSync(tempDir)) return;

    const files = fs.readdirSync(tempDir);
    const now = Date.now();

    for (const file of files) {
      const filePath = path.join(tempDir, file);
      const stats = fs.statSync(filePath);
      
      if (now - stats.mtime.getTime() > TEMP_DIR_EXPIRY) {
        fs.unlinkSync(filePath);
        console.log(`🧹 清理过期临时文件: ${file}`);
      }
    }
  } catch (error) {
    console.error('🧹 清理临时文件失败:', error);
  }
}

// 分块上传处理
export async function POST(request: NextRequest) {
  try {
    // 定期清理过期的临时文件
    cleanupExpiredTempFiles();
    
    // 确保上传目录存在
    await ensureUploadDirExists();
    
    // 检查Content-Type是否为multipart/form-data
    const contentType = request.headers.get('content-type');
    if (!contentType || !contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Content-Type必须为multipart/form-data' }, { status: 400 });
    }
    
    // 解析表单数据
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const chunkIndex = formData.get('chunkIndex') as string | null;
    const totalChunks = formData.get('totalChunks') as string | null;
    const fileName = formData.get('fileName') as string | null;
    const fileSize = formData.get('fileSize') as string | null;
    
    // 分块上传处理
    if (chunkIndex && totalChunks && fileName) {
      return await handleChunkUpload(formData, parseInt(chunkIndex), parseInt(totalChunks), fileName, fileSize ? parseInt(fileSize) : 0);
    }
    
    // 传统上传处理
    if (!file) {
      return NextResponse.json({ error: '未提供文件' }, { status: 400 });
    }

    console.log(`📁 收到文件: ${file.name}, 大小: ${file.size} 字节`);

    // 生成唯一文件名
    const uniqueFileName = generateUniqueFileName(file.name);
    
    // 获取当前存储状态
    const storageStatus = await cloudStorage.getStorageStatus();
    const usedStorage = storageStatus?.used || 0;
    const totalStorage = storageStatus?.total || 5 * 1024 * 1024 * 1024; // 默认5GB
    
    // 获取存储路径
    const storageInfo = getStoragePath(file.size, uniqueFileName, usedStorage, totalStorage);
    
    let fileUrl: string;
    
    if (storageInfo.storageType === 'local') {
      // 本地存储 - 使用绝对路径
      const absoluteFilePath = path.join(process.cwd(), storageInfo.path);
      
      console.log('📁 本地存储路径:', absoluteFilePath);
      
      // 确保目录存在
      const dir = path.dirname(absoluteFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // 获取文件流
      const webStream = file.stream();
      const nodeStream = Readable.fromWeb(webStream as any);

      // 创建写入流
      const writeStream = fs.createWriteStream(absoluteFilePath);

      // 管道传输
      await new Promise<void>((resolve, reject) => {
        nodeStream.pipe(writeStream)
          .on('finish', () => {
            console.log('✅ 本地存储写入完成:', uniqueFileName);
            resolve();
          })
          .on('error', (error) => {
            console.error('❌ 本地存储写入失败:', error);
            // 清理部分写入的文件
            if (fs.existsSync(absoluteFilePath)) {
              fs.unlinkSync(absoluteFilePath);
            }
            reject(error);
          });
      });

      console.log('✅ 本地存储上传成功:', uniqueFileName);

      // 生成访问路径
      fileUrl = `/uploads/${uniqueFileName}`;
    } else {
      // 云存储
      const cloudResult = await cloudStorage.uploadFile(file, uniqueFileName);
      
      if (!cloudResult.success || !cloudResult.url) {
        throw new Error(cloudResult.error || '云存储上传失败');
      }

      console.log('✅ 云存储上传成功:', uniqueFileName);
      fileUrl = cloudResult.url;
    }

    return NextResponse.json({ 
      success: true, 
      link: fileUrl,
      fileName: file.name,
      filePath: uniqueFileName,
      fileSize: file.size,
      storageType: storageInfo.storageType,
      switched: storageInfo.switched
    });
  } catch (error: any) {
    console.error('❌ 文件上传失败:', error);
    return NextResponse.json(
      { error: error.message || '上传失败' },
      { status: 500 }
    );
  }
}

// 处理分块上传
async function handleChunkUpload(
  formData: FormData,
  chunkIndex: number,
  totalChunks: number,
  fileName: string,
  fileSize: number
): Promise<NextResponse> {
  try {
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: '未提供文件块' }, { status: 400 });
    }

    console.log(`📁 收到分块: ${chunkIndex + 1}/${totalChunks}, 大小: ${file.size} 字节`);

    // 确保上传目录存在
    await ensureUploadDirExists();

    // 临时存储分块的目录
    const tempDir = path.join(process.cwd(), 'uploads', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // 分块文件路径
    const chunkPath = path.join(tempDir, `${fileName}.chunk${chunkIndex}`);

    // 写入分块文件
    const webStream = file.stream();
    const nodeStream = Readable.fromWeb(webStream as any);
    const writeStream = fs.createWriteStream(chunkPath);

    await new Promise<void>((resolve, reject) => {
      nodeStream.pipe(writeStream)
        .on('finish', () => {
          console.log('✅ 分块写入完成:', chunkPath);
          resolve();
        })
        .on('error', (error) => {
          console.error('❌ 分块写入失败:', error);
          // 清理部分写入的分块
          if (fs.existsSync(chunkPath)) {
            fs.unlinkSync(chunkPath);
          }
          reject(error);
        });
    });

    // 检查是否所有分块都已上传
    if (chunkIndex === totalChunks - 1) {
      // 合并所有分块
      return await mergeChunks(fileName, totalChunks, fileSize);
    }

    // 分块上传成功，等待下一个分块
    return NextResponse.json({
      success: true,
      message: `分块 ${chunkIndex + 1}/${totalChunks} 上传成功`,
      chunkIndex
    });
  } catch (error: any) {
    console.error('❌ 分块上传失败:', error);
    return NextResponse.json(
      { error: error.message || '分块上传失败' },
      { status: 500 }
    );
  }
}

// 單獨抽離：處理單一塊讀取、寫入、刪除
async function processSingleChunk(
  idx: number,
  fileName: string,
  tempDir: string,
  finalFileStream: fs.WriteStream
): Promise<void> {
  const chunkPath = path.join(tempDir, `${fileName}.chunk${idx}`);
  if (!fs.existsSync(chunkPath)) {
    throw new Error(`分块 ${idx} 不存在`);
  }
  const chunkStream = fs.createReadStream(chunkPath);
  await new Promise<void>((resolve, reject) => {
    chunkStream.pipe(finalFileStream, { end: false })
      .on('finish', resolve)
      .on('error', reject);
  });
  fs.unlinkSync(chunkPath);
  console.log(`✅ 处理并删除分块 ${idx + 1}`);
}

// 單獨抽離：清理剩餘分塊
function cleanRemainingChunks(startIdx: number, totalChunks: number, fileName: string, tempDir: string): void {
  let j = startIdx;
  while (j < totalChunks) {
    const remainingChunkPath = path.join(tempDir, `${fileName}.chunk${j}`);
    if (fs.existsSync(remainingChunkPath)) {
      fs.unlinkSync(remainingChunkPath);
    }
    j += 1;
  }
}

// 合并分块（迴圈內唔寫任何 const / let，全部邏輯抽去外部函數）
async function mergeChunks(
  fileName: string,
  totalChunks: number,
  fileSize: number
): Promise<NextResponse> {
  try {
    console.log('🔄 开始合并分块...');
    const tempDir = path.join(process.cwd(), 'uploads', 'temp');
    const finalFilePath = path.join(process.cwd(), 'uploads', fileName);
    const finalDir = path.dirname(finalFilePath);
    if (!fs.existsSync(finalDir)) {
      fs.mkdirSync(finalDir, { recursive: true });
    }
    const finalFileStream = fs.createWriteStream(finalFilePath);

    let idx = 0;
    while (idx < totalChunks) {
      try {
        await processSingleChunk(idx, fileName, tempDir, finalFileStream);
      } catch (err) {
        finalFileStream.end();
        if (fs.existsSync(finalFilePath)) {
          fs.unlinkSync(finalFilePath);
        }
        cleanRemainingChunks(idx, totalChunks, fileName, tempDir);
        throw err;
      }
      idx += 1;
    }

    finalFileStream.end();
    console.log('✅ 分块合并完成:', finalFilePath);
    const stats = fs.statSync(finalFilePath);
    if (fileSize > 0 && stats.size !== fileSize) {
      console.warn(`⚠️ 文件大小不匹配: 预期 ${fileSize} 字节, 实际 ${stats.size} 字节`);
    }
    const fileUrl = `/uploads/${fileName}`;
    return NextResponse.json({
      success: true,
      message: '文件上传完成',
      link: fileUrl,
      fileName: path.basename(fileName),
      filePath: fileName,
      fileSize: stats.size,
      storageType: 'local',
      switched: false
    });
  } catch (error: any) {
    console.error('❌ 分块合并失败:', error);
    return NextResponse.json(
      { error: error.message || '分块合并失败' },
      { status: 500 }
    );
  }
}
