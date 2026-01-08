import React from 'react';

interface PythonCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PythonCodeModal: React.FC<PythonCodeModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const codeString = `import torch
import torch.nn as nn
import torch.nn.functional as F

# ---------------------------------------------------------
# PHASE 2: AI ARCHITECTURE (THEORETICAL MODEL)
# ---------------------------------------------------------

class MorphoStereoNet(nn.Module):
    """
    U-Net style 1D Convolutional Network for Mono-to-Stereo Upmixing.
    Inspired by Conv-TasNet / Wave-U-Net.
    Input:  (Batch, 1, Samples)
    Output: (Batch, 2, Samples)
    """
    def __init__(self, channels=64, depth=4):
        super().__init__()
        self.encoder = nn.ModuleList()
        self.decoder = nn.ModuleList()
        
        # Initial Projection (Mono -> Features)
        self.in_conv = nn.Conv1d(1, channels, kernel_size=3, padding=1)
        
        # Encoder (Downsampling)
        # Uses strided convolutions to extract latent spatial features
        for i in range(depth):
            in_ch = channels * (2**i)
            out_ch = channels * (2**(i+1))
            self.encoder.append(
                nn.Sequential(
                    nn.Conv1d(in_ch, out_ch, kernel_size=4, stride=2, padding=1),
                    nn.GELU(),
                    nn.GroupNorm(8, out_ch)
                )
            )
            
        # Bottleneck (Dilated Convolutions for Context)
        bt_ch = channels * (2**depth)
        self.bottleneck = nn.Sequential(
            nn.Conv1d(bt_ch, bt_ch, kernel_size=3, dilation=2, padding=2),
            nn.GELU(),
            nn.Conv1d(bt_ch, bt_ch, kernel_size=3, dilation=4, padding=4),
            nn.GELU()
        )

        # Decoder (Upsampling)
        # Reconstructs stereo signal from latent features + Skip Connections
        for i in range(depth - 1, -1, -1):
            in_ch = channels * (2**(i+2)) # Double input due to concat
            out_ch = channels * (2**i)
            self.decoder.append(
                nn.Sequential(
                    nn.ConvTranspose1d(in_ch, out_ch, kernel_size=4, stride=2, padding=1),
                    nn.GELU(),
                    nn.GroupNorm(8, out_ch)
                )
            )
            
        # Final Projection (Features -> Stereo L/R)
        self.out_conv = nn.Conv1d(channels, 2, kernel_size=3, padding=1)
        self.tanh = nn.Tanh()

    def forward(self, x):
        # x: [Batch, 1, Samples]
        x = self.in_conv(x)
        skips = []
        
        # Encode
        for block in self.encoder:
            skips.append(x)
            x = block(x)
            
        x = self.bottleneck(x)
        
        # Decode with Skip Connections (U-Net structure)
        for i, block in enumerate(self.decoder):
            skip = skips[-(i+1)]
            x = torch.cat([x, skip], dim=1) 
            x = block(x)
            
        # Output: [Batch, 2, Samples]
        return self.tanh(self.out_conv(x))

class StereoAwareLoss(nn.Module):
    """
    Custom Loss Function that penalizes audio reconstruction error (SDR proxy)
    AND Phase Correlation deviation.
    """
    def __init__(self, alpha=1.0, beta=0.8):
        super().__init__()
        self.alpha = alpha # Weight for L1 (Time Domain)
        self.beta = beta   # Weight for Phase Correlation
        
    def correlation(self, x, y):
        # Pearson correlation along the time dimension
        vx = x - torch.mean(x, dim=-1, keepdim=True)
        vy = y - torch.mean(y, dim=-1, keepdim=True)
        
        numerator = torch.sum(vx * vy, dim=-1)
        denominator = torch.sqrt(torch.sum(vx ** 2, dim=-1)) * \
                      torch.sqrt(torch.sum(vy ** 2, dim=-1))
        
        # Add epsilon to avoid division by zero
        return numerator / (denominator + 1e-8)

    def forward(self, pred, target):
        # 1. Reconstruction Loss (L1 - Time Domain)
        l1_loss = F.l1_loss(pred, target)
        
        # 2. Phase Correlation Loss
        # Extract L/R channels from (Batch, 2, Samples)
        pred_l, pred_r = pred[:, 0, :], pred[:, 1, :]
        target_l, target_r = target[:, 0, :], target[:, 1, :]
        
        # Calculate L-R correlation for both
        corr_pred = self.correlation(pred_l, pred_r)
        corr_target = self.correlation(target_l, target_r)
        
        # Minimize the difference in spatial relationship
        # If target is highly correlated (mono), model should predict correlated.
        # If target is wide, model should predict wide.
        phase_loss = F.mse_loss(corr_pred, corr_target)
        
        total_loss = (self.alpha * l1_loss) + (self.beta * phase_loss)
        return total_loss`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-dsp-panel border border-dsp-panel w-full max-w-4xl h-[80vh] flex flex-col rounded-lg shadow-2xl">
        <div className="flex justify-between items-center p-6 border-b border-white/10">
          <div className="flex flex-col">
            <h2 className="text-xl font-bold text-dsp-accent font-mono">Phase 2: AI Architecture</h2>
            <span className="text-xs text-dsp-muted">PyTorch Implementation (Theoretical)</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            Close
          </button>
        </div>
        <div className="flex-1 overflow-auto p-0 bg-[#0d1117]">
            <pre className="p-6 text-sm font-mono text-gray-300 leading-relaxed">
              <code>{codeString}</code>
            </pre>
        </div>
        <div className="p-4 border-t border-white/10 text-xs text-gray-500 bg-dsp-panel rounded-b-lg flex justify-between">
          <span>Architecture: 1D U-Net (Conv-TasNet style)</span>
          <span className="text-emerald-400 font-bold">Optimized for: SDR + Phase Consistency</span>
        </div>
      </div>
    </div>
  );
};

export default PythonCodeModal;