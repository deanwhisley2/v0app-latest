/**
 * Nexus Core Test Engine
 * Validates system components and integration
 */

export interface TestResult {
  component: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  timestamp: Date;
}

export class TestEngine {
  private results: TestResult[] = [];
  
  async runAllTests(): Promise<TestResult[]> {
    console.log('🧪 Running Nexus Core System Tests...\n');
    
    await this.testBasicImports();
    await this.testNexusEngine();
    await this.testTradingStrategies();
    
    this.printSummary();
    return this.results;
  }
  
  private async testBasicImports(): Promise<void> {
    try {
      console.log('📦 Testing basic imports...');
      
      const nexusModule = await import('./nexus-engine');
      const strategiesModule = await import('../lib/trading-strategies');
      
      if (nexusModule && strategiesModule) {
        this.addResult('Basic Imports', 'pass', 'All modules found');
      } else {
        this.addResult('Basic Imports', 'fail', 'Modules not found');
      }
    } catch (error: any) {
      this.addResult('Basic Imports', 'fail', `Import failed: ${error.message}`);
    }
  }
  
  private async testNexusEngine(): Promise<void> {
    try {
      console.log('📦 Testing Nexus Engine...');
      
      const { NexusTradingEngine } = await import('./nexus-engine');
      
      if (NexusTradingEngine) {
        const engine = new NexusTradingEngine();
        this.addResult('NexusEngine', 'pass', 'Engine loads successfully');
        
        // Test basic engine methods
        if (typeof engine.initialize === 'function') {
          this.addResult('NexusEngine Methods', 'pass', 'initialize() method exists');
        }
        if (typeof engine.getTradeSignal === 'function') {
          this.addResult('NexusEngine Methods', 'pass', 'getTradeSignal() method exists');
        }
      } else {
        this.addResult('NexusEngine', 'fail', 'NexusTradingEngine export not found');
      }
    } catch (error: any) {
      this.addResult('NexusEngine', 'fail', `Error: ${error.message}`);
    }
  }
  
  private async testTradingStrategies(): Promise<void> {
    try {
      console.log('📊 Testing Trading Strategies...');
      
      const strategies: Record<string, unknown> = await import('../lib/trading-strategies');
      
      if (strategies) {
        // Check for expected exports from the actual trading-strategies module
        const expectedExports = ['initializeEngine', 'analyzeWithNexus', 'analyzeWithAllStrategies'] as const;
        const foundExports = expectedExports.filter(exp => typeof strategies[exp] !== 'undefined');
        
        if (foundExports.length > 0) {
          this.addResult('TradingStrategies', 'pass', `Found exports: ${foundExports.join(', ')}`);
          
          // Test if exports are functions
          for (const exportName of foundExports) {
            if (typeof strategies[exportName] === 'function') {
              this.addResult(`Export: ${exportName}`, 'pass', 'Valid function');
            }
          }
        } else {
          this.addResult('TradingStrategies', 'fail', 'No expected exports found');
        }
      } else {
        this.addResult('TradingStrategies', 'fail', 'Strategies module not found');
      }
    } catch (error: any) {
      this.addResult('TradingStrategies', 'fail', `Error: ${error.message}`);
    }
  }
  
  private addResult(component: string, status: 'pass' | 'fail' | 'warning', message: string): void {
    this.results.push({
      component,
      status,
      message,
      timestamp: new Date()
    });
    
    const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⚠️';
    console.log(`${icon} ${component}: ${message}`);
  }
  
  private printSummary(): void {
    console.log('\n📋 Test Summary:');
    console.log('─'.repeat(50));
    
    const passed = this.results.filter(r => r.status === 'pass').length;
    const failed = this.results.filter(r => r.status === 'fail').length;
    const warnings = this.results.filter(r => r.status === 'warning').length;
    
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⚠️ Warnings: ${warnings}`);
    console.log(`📊 Total: ${this.results.length}`);
    
    if (failed === 0) {
      console.log('\n🎉 All systems operational!');
    } else {
      console.log('\n🔧 Some tests failed. Check the errors above.');
    }
  }
}

// Auto-run if this file is executed directly
const testEngine = new TestEngine();
testEngine.runAllTests().catch(console.error);
