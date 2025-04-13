// 全局变量
let currentConversationId = '';
let markdownFile = null;
let isReasoningVisible = false; // 新增全局变量，跟踪思考过程显示状态
let apiParams = {
    stream: true,
    max_tokens: 2048,
    stop: null,
    temperature: 0.7,
    top_p: 0.7,
    top_k: 50,
    frequency_penalty: 0.5,
    n: 1,
    response_format: {"type": "text"}
};

// 新增：模型分组映射
const modelVendorMap = {
    '硅基流动': [
        "Qwen/QwQ-32B", 
        "Qwen/Qwen2.5-72B-Instruct-128K", 
        "Qwen/Qwen2.5-72B-Instruct", 
        "Qwen/Qwen2.5-32B-Instruct", 
        "Qwen/Qwen2.5-14B-Instruct", 
        "Qwen/Qwen2.5-7B-Instruct",
        "Qwen/Qwen2.5-Coder-32B-Instruct", 
        "Qwen/Qwen2.5-Coder-7B-Instruct", 
        "Qwen/Qwen2-7B-Instruct", 
        "Qwen/Qwen2-1.5B-Instruct", 
        "Qwen/QwQ-32B-Preview",
        "Vendor-A/Qwen/Qwen2.5-72B-Instruct",
        "Pro/deepseek-ai/DeepSeek-R1", 
        "Pro/deepseek-ai/DeepSeek-V3", 
        "deepseek-ai/DeepSeek-R1", 
        "deepseek-ai/DeepSeek-V3", 
        "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B", 
        "deepseek-ai/DeepSeek-R1-Distill-Qwen-14B", 
        "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B", 
        "deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B", 
        "Pro/deepseek-ai/DeepSeek-R1-Distill-Qwen-7B", 
        "Pro/deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B", 
        "deepseek-ai/DeepSeek-V2.5",
        "TeleAI/TeleChat2",
        "THUDM/glm-4-9b-chat",
        "Pro/THUDM/chatglm3-6b",
        "Pro/THUDM/glm-4-9b-chat",
        "internlm/internlm2_5-7b-chat",
        "internlm/internlm2_5-20b-chat",
        "Pro/Qwen/Qwen2.5-7B-Instruct", 
        "Pro/Qwen/Qwen2-7B-Instruct", 
        "Pro/Qwen/Qwen2-1.5B-Instruct"
    ],
    '智谱清言': [
        "zhipuai/glm-4-plus",
        "zhipuai/glm-4-0520",
        "zhipuai/glm-4",
        "zhipuai/glm-4-air",
        "zhipuai/glm-4-airx",
        "zhipuai/glm-4-long",
        "zhipuai/glm-4-flash",
        "zhipuai/glm-3-turbo",
        "zhipuai/glm-zero-preview"
    ]
};

// 添加渲染LaTeX公式的函数
function renderMathJax(element) {
    // 确保MathJax已加载
    if (typeof MathJax !== 'undefined') {
        try {
            // 处理代码块中的LaTeX符号，避免被错误渲染
            element.querySelectorAll('pre code').forEach(codeBlock => {
                // 标记代码块不处理公式
                codeBlock.setAttribute('data-tex', 'ignore');
            });
            
            // 处理内联代码中的LaTeX符号，以避免被错误渲染
            element.querySelectorAll('code:not(pre code)').forEach(codeElement => {
                const codeText = codeElement.textContent;
                if (codeText.includes('$') || codeText.includes('\\(') || codeText.includes('\\[')) {
                    codeElement.setAttribute('data-tex', 'ignore');
                }
            });
            
            // 特殊处理：为纯文本中的公式添加适当的标记
            // 这有助于MathJax更好地识别公式
            element.childNodes.forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    const text = node.textContent;
                    // 检查是否包含$符号（行内公式）或$$符号（块级公式），或括号
                    if (text.includes('$') || text.includes('\\(') || text.includes('\\[') || 
                        (text.includes('(') && (text.includes('/') || text.includes('\\'))) || 
                        (text.includes('[') && (text.includes('/') || text.includes('\\')))) {
                        // 创建新的span元素包装文本节点
                        const span = document.createElement('span');
                        span.className = 'math-text';
                        span.textContent = text;
                        node.parentNode.replaceChild(span, node);
                    }
                }
            });
            
            // 告诉MathJax重新处理页面上的数学公式
            MathJax.typesetPromise([element]).catch(error => {
                console.error('MathJax渲染错误:', error);
            });
        } catch (e) {
            console.error('调用MathJax时发生错误:', e);
        }
    }
}

// 添加MathJax监视器，持续检测公式变化
function setupMathJaxObserver() {
    if (!('MutationObserver' in window) || typeof MathJax === 'undefined') {
        return; // 浏览器不支持或MathJax未加载
    }
    
    // 创建一个观察器配置
    const config = {
        childList: true,       // 观察直接子节点变化
        subtree: true,         // 观察所有后代节点
        characterData: true    // 观察文本变化
    };
    
    // 创建观察器实例
    const observer = new MutationObserver(function(mutations) {
        let needsRender = false;
        let targetNodes = [];
        
        // 检查变化是否可能包含数学公式
        mutations.forEach(function(mutation) {
            // 如果是节点添加
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach(function(node) {
                    // 检查节点内容是否包含可能的公式
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const text = node.textContent;
                        // 检查是否包含可能的公式标记
                        if (text.includes('$') || 
                            text.includes('\\(') || 
                            text.includes('\\[') ||
                            (text.includes('(') && (text.includes('/') || text.includes('\\'))) ||
                            (text.includes('[') && (text.includes('/') || text.includes('\\')))) {
                            needsRender = true;
                            targetNodes.push(node);
                        }
                    }
                });
            }
            
            // 如果是文本变化
            if (mutation.type === 'characterData') {
                const text = mutation.target.textContent;
                // 检查是否包含可能的公式标记
                if (text.includes('$') || 
                    text.includes('\\(') || 
                    text.includes('\\[') ||
                    (text.includes('(') && (text.includes('/') || text.includes('\\'))) ||
                    (text.includes('[') && (text.includes('/') || text.includes('\\')))) {
                    needsRender = true;
                    // 获取包含文本节点的元素
                    const parentElement = mutation.target.parentElement;
                    if (parentElement) {
                        targetNodes.push(parentElement);
                    }
                }
            }
        });
        
        // 如果需要渲染，对相关元素应用MathJax
        if (needsRender && targetNodes.length > 0) {
            // 去除重复节点
            const uniqueNodes = [...new Set(targetNodes)];
            
            // 使用短延迟确保内容已完全更新
            setTimeout(function() {
                uniqueNodes.forEach(function(node) {
                    renderMathJax(node);
                });
            }, 50);
        }
    });
    
    // 开始观察整个聊天消息区域
    const chatMessages = document.querySelector('.chat-messages');
    if (chatMessages) {
        observer.observe(chatMessages, config);
        console.log('MathJax观察器已启动');
    }
    
    return observer; // 返回观察器以便稍后可能需要断开连接
}

// DOM加载完成后执行
document.addEventListener('DOMContentLoaded', function() {
    // 检查是否是新创建的对话
    const isNewConversation = sessionStorage.getItem('newConversationCreated') === 'true';
    if (isNewConversation) {
        console.log('检测到新创建的对话，将重新初始化MathJax');
        sessionStorage.removeItem('newConversationCreated'); // 清除标记
    }
    
    // 初始化页面元素引用
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const chatMessages = document.getElementById('chat-messages');
    const conversationList = document.getElementById('conversation-list');
    const newChatBtn = document.getElementById('new-chat-btn');
    const toggleSidebarBtn = document.getElementById('toggle-sidebar');
    const sidebar = document.getElementById('sidebar');
    const editTitleBtn = document.getElementById('edit-title-btn');
    const currentConversationTitle = document.getElementById('current-conversation-title');
    const modelSelector = document.getElementById('model-selector');
    
    // 新增：模型选择器相关元素
    const modelSelectButton = document.getElementById('model-select-button');
    const currentModelDisplay = document.getElementById('current-model-display');
    const modelDropdown = document.getElementById('model-dropdown');
    const vendorList = document.getElementById('vendor-list');
    const modelList = document.getElementById('model-list');
    
    // 高级设置相关元素
    const advancedSettingsBtn = document.getElementById('advanced-settings-btn');
    const advancedSettingsModal = document.getElementById('advanced-settings-modal');
    const closeAdvancedSettingsBtn = document.getElementById('close-advanced-settings');
    const saveSettingsBtn = document.getElementById('save-settings');
    const resetSettingsBtn = document.getElementById('reset-settings');
    const settingsSaveStatus = document.getElementById('settings-save-status');
    
    // 标题编辑相关
    const editTitleModal = document.getElementById('edit-title-modal');
    const editTitleForm = document.getElementById('edit-title-form');
    const conversationTitleInput = document.getElementById('conversation-title-input');
    const cancelEditTitle = document.getElementById('cancel-edit-title');
    
    // Markdown查看器相关
    const markdownViewer = document.getElementById('markdown-viewer');
    const closeMarkdownViewerBtn = document.getElementById('close-markdown-viewer');
    const downloadMarkdownBtn = document.getElementById('download-markdown');
    const markdownIframe = document.getElementById('markdown-iframe');
    
    // 获取当前会话ID
    currentConversationId = document.getElementById('conversation-id')?.value;
    
    // 确保所有元素都存在（可能在其他页面上不存在）
    if (chatForm && messageInput && chatMessages) {
        // 初始化自动调整高度的输入框
        initAutoResizeTextarea(messageInput);
        
        // 初始化页面事件
        initEvents();
        
        // 初始化模型选择器
        initModelSelector();
        
        // 滚动到最底部
        scrollToBottom();
        
        // 为上下文中已有的消息添加事件监听
        initExistingMessages();
        
        // 初始化语法高亮
        initSyntaxHighlighting();
        
        // 初始化设置面板中的滑动条
        initSettingsSliders();
        
        // 渲染历史AI消息的Markdown内容
        renderHistoryMessages();
        
        // 确保MathJax已加载并初始化
        initMathJax();
        
        // 检查当前对话是否为新对话（没有消息）
        const chatInputContainer = document.querySelector('.chat-input-container');
        if (chatInputContainer && chatInputContainer.classList.contains('new-conversation')) {
            // 为新对话自动聚焦输入框
            setTimeout(() => messageInput.focus(), 300);
        }
    }
    
    // 添加新的MathJax初始化函数
    function initMathJax() {
        // 如果MathJax已加载，立即启动观察器
        if (typeof MathJax !== 'undefined') {
            if (MathJax.startup && MathJax.startup.defaultReady) {
                console.log('MathJax已加载，开始初始化');
                setupMathJaxObserver();
                
                // 对当前页面所有消息应用MathJax渲染
                document.querySelectorAll('.message-container.assistant .message-body.markdown-body').forEach(messageBody => {
                    renderMathJax(messageBody);
                });
                
                // 渲染思考过程中的公式
                document.querySelectorAll('.reasoning-content').forEach(reasoningContent => {
                    renderMathJax(reasoningContent);
                });
            }
        } else {
            // MathJax尚未加载，添加加载事件监听
            console.log('等待MathJax加载');
            document.addEventListener('MathJaxReady', function() {
                console.log('MathJax加载完成事件触发');
                setupMathJaxObserver();
                
                // 对当前页面所有消息应用MathJax渲染
                setTimeout(() => {
                    document.querySelectorAll('.message-container.assistant .message-body.markdown-body').forEach(messageBody => {
                        renderMathJax(messageBody);
                    });
                    
                    // 渲染思考过程中的公式
                    document.querySelectorAll('.reasoning-content').forEach(reasoningContent => {
                        renderMathJax(reasoningContent);
                    });
                }, 100);
            });
        }
    }
    
    // 函数定义
    function initEvents() {
        // 聊天表单提交
        chatForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const message = messageInput.value.trim();
            if (!message) return;
            
            sendMessage(message);
            messageInput.value = '';
            messageInput.style.height = 'auto';
        });
        
        // 侧边栏切换
        if (toggleSidebarBtn) {
            toggleSidebarBtn.addEventListener('click', function() {
                sidebar.classList.toggle('sidebar-collapsed');
            });
        }
        
        // 新建对话
        if (newChatBtn) {
            newChatBtn.addEventListener('click', createNewConversation);
        }
        
        // 对话列表点击处理
        if (conversationList) {
            conversationList.addEventListener('click', function(e) {
                handleConversationListClick(e);
            });
        }
        
        // 当点击聊天区域时，如果是新对话，聚焦到输入框
        if (chatMessages) {
            chatMessages.addEventListener('click', function() {
                const chatInputContainer = document.querySelector('.chat-input-container');
                if (chatInputContainer && chatInputContainer.classList.contains('new-conversation')) {
                    messageInput.focus();
                }
            });
        }
        
        // 模型选择器变更
        if (modelSelector) {
            modelSelector.addEventListener('change', function() {
                // 仅在需要时记录选中的模型
                console.log('Model changed to:', this.value);
            });
        }
        
        // 编辑标题
        if (editTitleBtn && editTitleModal) {
            editTitleBtn.addEventListener('click', function() {
                conversationTitleInput.value = currentConversationTitle.textContent.trim();
                editTitleModal.classList.remove('hidden');
            });
            
            // 取消编辑标题
            cancelEditTitle.addEventListener('click', function() {
                editTitleModal.classList.add('hidden');
            });
            
            // 提交编辑标题表单
            editTitleForm.addEventListener('submit', function(e) {
                e.preventDefault();
                updateConversationTitle();
            });
            
            // 模态框背景点击关闭
            editTitleModal.addEventListener('click', function(e) {
                if (e.target === editTitleModal || e.target.classList.contains('bg-opacity-50')) {
                    editTitleModal.classList.add('hidden');
                }
            });
        }
        
        // 打开高级设置
        if (advancedSettingsBtn && advancedSettingsModal) {
            advancedSettingsBtn.addEventListener('click', function() {
                loadAdvancedSettings();
                advancedSettingsModal.classList.remove('hidden');
            });
            
            // 关闭高级设置
            closeAdvancedSettingsBtn.addEventListener('click', function() {
                advancedSettingsModal.classList.add('hidden');
            });
            
            // 高级设置模态框点击背景关闭
            advancedSettingsModal.addEventListener('click', function(e) {
                if (e.target === advancedSettingsModal || e.target.classList.contains('bg-opacity-50')) {
                    advancedSettingsModal.classList.add('hidden');
                }
            });
            
            // 保存高级设置
            if (saveSettingsBtn) {
                saveSettingsBtn.addEventListener('click', saveAdvancedSettings);
            }
            
            // 重置高级设置
            if (resetSettingsBtn) {
                resetSettingsBtn.addEventListener('click', resetAdvancedSettings);
            }
        }
        
        // 关闭Markdown查看器
        if (markdownViewer && closeMarkdownViewerBtn) {
            closeMarkdownViewerBtn.addEventListener('click', function() {
                markdownViewer.classList.add('hidden');
            });
            
            // 下载Markdown
            downloadMarkdownBtn.addEventListener('click', function() {
                if (markdownFile) {
                    window.open(`/api/download_markdown?file=${markdownFile}`, '_blank');
                }
            });
        }
        
        // 为已有的查看Markdown按钮添加事件
        document.querySelectorAll('.view-markdown-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                viewMarkdown();
            });
        });
        
        // 全局事件委托，处理动态添加的元素
        document.addEventListener('click', function(e) {
            // 处理复制按钮
            if (e.target.closest('.copy-btn')) {
                const messageContent = e.target.closest('.message-content');
                const textToCopy = messageContent.querySelector('.message-body').innerText;
                copyToClipboard(textToCopy);
            }
            
            // 处理思考过程切换按钮（包括顶部按钮）
            if (e.target.closest('.reasoning-toggle') || e.target.closest('.toggle-reasoning-btn') || e.target.closest('.reasoning-toggle-top')) {
                e.stopPropagation(); // 阻止事件冒泡，防止其他点击事件触发
                e.preventDefault(); // 阻止默认行为
                
                const messageContent = e.target.closest('.message-content');
                const reasoningContent = messageContent.querySelector('.reasoning-content');
                if (reasoningContent) {
                    toggleReasoningDisplay(reasoningContent, e.target.closest('.reasoning-toggle-top'));
                }
            }
            
            // 处理Markdown查看按钮
            if (e.target.closest('.view-markdown-btn')) {
                viewMarkdown();
            }
            
            // 处理点赞按钮
            if (e.target.closest('.like-btn')) {
                const likeBtn = e.target.closest('.like-btn');
                const dislikeBtn = likeBtn.closest('.message-feedback').querySelector('.dislike-btn');
                
                // 切换点赞状态
                likeBtn.classList.toggle('active');
                
                // 如果点赞，则取消踩的状态
                if (likeBtn.classList.contains('active') && dislikeBtn.classList.contains('active')) {
                    dislikeBtn.classList.remove('active');
                }
                
                // 这里可以发送点赞请求到服务器
                const messageContent = likeBtn.closest('.message-content');
                const messageId = messageContent.querySelector('.message-body').id;
                if (messageId) {
                    console.log('点赞消息:', messageId, likeBtn.classList.contains('active'));
                    // 实际使用时，可以发送Ajax请求
                    // sendFeedback(messageId, 'like', likeBtn.classList.contains('active'));
                }
            }
            
            // 处理踩按钮
            if (e.target.closest('.dislike-btn')) {
                const dislikeBtn = e.target.closest('.dislike-btn');
                const likeBtn = dislikeBtn.closest('.message-feedback').querySelector('.like-btn');
                
                // 切换踩状态
                dislikeBtn.classList.toggle('active');
                
                // 如果踩，则取消点赞的状态
                if (dislikeBtn.classList.contains('active') && likeBtn.classList.contains('active')) {
                    likeBtn.classList.remove('active');
                }
                
                // 这里可以发送踩请求到服务器
                const messageContent = dislikeBtn.closest('.message-content');
                const messageId = messageContent.querySelector('.message-body').id;
                if (messageId) {
                    console.log('踩消息:', messageId, dislikeBtn.classList.contains('active'));
                    // 实际使用时，可以发送Ajax请求
                    // sendFeedback(messageId, 'dislike', dislikeBtn.classList.contains('active'));
                }
            }
            
            // 处理收藏按钮
            if (e.target.closest('.favorite-btn')) {
                const favoriteBtn = e.target.closest('.favorite-btn');
                
                // 切换收藏状态
                favoriteBtn.classList.toggle('active');
                
                // 更改图标
                const icon = favoriteBtn.querySelector('i');
                if (favoriteBtn.classList.contains('active')) {
                    icon.className = 'fas fa-star'; // 实心星星
                } else {
                    icon.className = 'far fa-star'; // 空心星星
                }
                
                // 这里可以发送收藏请求到服务器
                const messageContent = favoriteBtn.closest('.message-content');
                const messageId = messageContent.querySelector('.message-body').id;
                if (messageId) {
                    console.log('收藏消息:', messageId, favoriteBtn.classList.contains('active'));
                    // 实际使用时，可以发送Ajax请求
                    // saveFavorite(messageId, favoriteBtn.classList.contains('active'));
                }
            }
            
            // 处理重新回答按钮
            if (e.target.closest('.regenerate-btn')) {
                // 找到对应的消息元素
                const messageContent = e.target.closest('.message-content');
                const messageContainer = messageContent.closest('.message-container');
                
                // 找到与此消息对应的用户消息
                let userMessage = '';
                let userMessageElement = messageContainer.previousElementSibling;
                
                // 向上查找最近的用户消息
                while (userMessageElement) {
                    if (userMessageElement.classList.contains('user')) {
                        userMessage = userMessageElement.querySelector('.message-body').textContent.trim();
                        break;
                    }
                    userMessageElement = userMessageElement.previousElementSibling;
                }
                
                if (userMessage) {
                    // 删除当前AI回复
                    messageContainer.remove();
                    
                    // 重新发送用户消息，生成新回答
                    sendMessage(userMessage);
                } else {
                    showErrorNotification('无法找到对应的用户消息');
                }
            }
        });
    }
    
    function initAutoResizeTextarea(textarea) {
        textarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });
    }
    
    function initSettingsSliders() {
        // 初始化滑块事件
        document.querySelectorAll('.settings-slider').forEach(slider => {
            slider.addEventListener('input', function() {
                const valueDisplay = document.getElementById(`${this.id.replace('-slider', '')}-value`);
                if (valueDisplay) {
                    valueDisplay.textContent = this.value;
                }
            });
        });
        
        // 初始化值标签点击事件，使其可编辑
        document.querySelectorAll('[id$="-value"]').forEach(valueSpan => {
            if (valueSpan.id.includes('max-tokens') || 
                valueSpan.id.includes('temperature') || 
                valueSpan.id.includes('top-p') || 
                valueSpan.id.includes('top-k') || 
                valueSpan.id.includes('frequency-penalty')) {
                
                valueSpan.addEventListener('click', function() {
                    const currentValue = this.textContent;
                    const sliderId = this.id.replace('-value', '-slider');
                    const slider = document.getElementById(sliderId);
                    
                    // 创建输入框
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.value = currentValue;
                    input.className = 'text-sm text-gray-500 w-16 text-right';
                    input.style.border = '1px solid #d1d5db';
                    input.style.borderRadius = '4px';
                    input.style.padding = '2px 4px';
                    
                    // 替换原有标签
                    this.textContent = '';
                    this.appendChild(input);
                    input.focus();
                    input.select();
                    
                    // 处理输入完成
                    const handleInputComplete = () => {
                        let newValue = input.value.trim();
                        
                        // 验证输入是数字
                        if (/^-?\d*\.?\d*$/.test(newValue)) {
                            newValue = parseFloat(newValue);
                            
                            // 检查范围限制
                            const min = parseFloat(slider.min);
                            const max = parseFloat(slider.max);
                            const step = parseFloat(slider.step) || 1;
                            
                            if (newValue < min) newValue = min;
                            if (newValue > max) newValue = max;
                            
                            // 更新滑块和显示值
                            slider.value = newValue;
                            this.textContent = newValue;
                        } else {
                            // 如果输入无效，恢复原值
                            this.textContent = currentValue;
                        }
                    };
                    
                    // 添加事件监听
                    input.addEventListener('blur', handleInputComplete);
                    input.addEventListener('keydown', function(e) {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            handleInputComplete();
                        }
                        if (e.key === 'Escape') {
                            e.preventDefault();
                            valueSpan.textContent = currentValue;
                        }
                    });
                });
            }
        });
    }
    
    function initExistingMessages() {
        // 为已有的消息添加事件监听
        document.querySelectorAll('.reasoning-toggle').forEach(button => {
            button.addEventListener('click', function() {
                const reasoningContent = this.nextElementSibling;
                toggleReasoningDisplay(reasoningContent);
            });
        });
    }
    
    function initSyntaxHighlighting() {
        // 检查hljs是否可用
        if (typeof hljs !== 'undefined') {
            // 对页面上已有的代码块进行语法高亮
            document.querySelectorAll('pre code').forEach(block => {
                hljs.highlightElement(block);
            });
        }
    }
    
    function toggleReasoningDisplay(reasoningContent, button) {
        if (!reasoningContent) return;
        
        // 切换全局显示状态
        isReasoningVisible = !isReasoningVisible;
        
        // 设置显示状态
        reasoningContent.style.display = isReasoningVisible ? 'block' : 'none';
        
        // 更新按钮状态
        if (button) {
            // 如果是顶部按钮
            button.classList.toggle('active', isReasoningVisible);
            button.innerHTML = isReasoningVisible 
                ? '<i class="fas fa-eye-slash mr-1"></i> 隐藏思考过程' 
                : '<i class="fas fa-brain mr-1"></i> 显示思考过程';
        }
        
        // 查找并更新所有相关按钮
        const messageContainer = reasoningContent.closest('.message-container');
        if (messageContainer) {
            const allButtons = messageContainer.querySelectorAll('.reasoning-toggle-top');
            allButtons.forEach(btn => {
                if (btn !== button) {
                    btn.classList.toggle('active', isReasoningVisible);
                    btn.innerHTML = isReasoningVisible 
                        ? '<i class="fas fa-eye-slash mr-1"></i> 隐藏思考过程' 
                        : '<i class="fas fa-brain mr-1"></i> 显示思考过程';
                }
            });
        }
    }
    
    function scrollToBottom() {
        if (chatMessages) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }
    
    function createNewConversation() {
        // 在页面跳转前，设置会话标记
        sessionStorage.setItem('newConversationCreated', 'true');
        
        fetch('/api/conversations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('网络响应不正常');
            }
            return response.json();
        })
        .then(data => {
            window.location.href = `/chat?conversation_id=${data.id}`;
        })
        .catch(error => {
            console.error('Error creating new conversation:', error);
            showErrorNotification('创建新对话失败，请重试');
        });
    }
    
    function handleConversationListClick(e) {
        const conversationItem = e.target.closest('.conversation-item');
        
        // 处理删除按钮
        const deleteBtn = e.target.closest('.delete-conversation-btn');
        if (deleteBtn) {
            e.stopPropagation(); // 阻止冒泡，防止触发对话项点击事件
            
            const id = deleteBtn.dataset.id;
            if (id && confirm('确定要删除此对话吗？')) {
                deleteConversation(id);
            }
            return;
        }
        
        // 处理对话项点击
        if (conversationItem) {
            const id = conversationItem.dataset.id;
            if (id) {
                window.location.href = `/chat?conversation_id=${id}`;
            }
        }
    }
    
    function deleteConversation(id) {
        fetch(`/api/conversations/${id}`, {
            method: 'DELETE'
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('网络响应不正常');
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                const conversationItem = document.querySelector(`.conversation-item[data-id="${id}"]`);
                if (conversationItem) {
                    conversationItem.remove();
                }
                
                // 如果删除的是当前对话，重定向到首页
                if (id === currentConversationId) {
                    window.location.href = '/chat';
                }
            } else {
                throw new Error('服务器返回失败状态');
            }
        })
        .catch(error => {
            console.error('Error deleting conversation:', error);
            showErrorNotification('删除对话失败，请重试');
        });
    }
    
    function updateConversationTitle() {
        const newTitle = conversationTitleInput.value.trim();
        if (!newTitle) return;
        
        fetch(`/api/conversations/${currentConversationId}/title`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title: newTitle
            })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('网络响应不正常');
            }
            return response.json();
        })
        .then(data => {
            currentConversationTitle.textContent = data.title;
            
            // 更新左侧对话列表中的标题
            const conversationItem = document.querySelector(`.conversation-item[data-id="${data.id}"] .conversation-title`);
            if (conversationItem) {
                conversationItem.textContent = data.title;
            }
            
            editTitleModal.classList.add('hidden');
        })
        .catch(error => {
            console.error('Error updating conversation title:', error);
            showErrorNotification('更新标题失败，请重试');
        });
    }
    
    function loadAdvancedSettings() {
        // 加载当前设置到高级设置面板
        document.getElementById('stream-toggle').checked = apiParams.stream;
        document.getElementById('max-tokens-slider').value = apiParams.max_tokens;
        document.getElementById('max-tokens-value').textContent = apiParams.max_tokens;
        document.getElementById('temperature-slider').value = apiParams.temperature;
        document.getElementById('temperature-value').textContent = apiParams.temperature;
        document.getElementById('top-p-slider').value = apiParams.top_p;
        document.getElementById('top-p-value').textContent = apiParams.top_p;
        document.getElementById('top-k-slider').value = apiParams.top_k;
        document.getElementById('top-k-value').textContent = apiParams.top_k;
        document.getElementById('frequency-penalty-slider').value = apiParams.frequency_penalty;
        document.getElementById('frequency-penalty-value').textContent = apiParams.frequency_penalty;
        
        if (apiParams.stop) {
            if (Array.isArray(apiParams.stop)) {
                document.getElementById('stop-sequences').value = apiParams.stop.join(',');
            } else {
                document.getElementById('stop-sequences').value = apiParams.stop;
            }
        } else {
            document.getElementById('stop-sequences').value = '';
        }
    }
    
    function saveAdvancedSettings() {
        try {
            // 获取表单数据
            const streamToggle = document.getElementById('stream-toggle').checked;
            const maxTokens = parseInt(document.getElementById('max-tokens-slider').value);
            const temperature = parseFloat(document.getElementById('temperature-slider').value);
            const topP = parseFloat(document.getElementById('top-p-slider').value);
            const topK = parseInt(document.getElementById('top-k-slider').value);
            const frequencyPenalty = parseFloat(document.getElementById('frequency-penalty-slider').value);
            
            const stopSequences = document.getElementById('stop-sequences').value.trim();
            const stopArray = stopSequences ? stopSequences.split(',').map(s => s.trim()) : null;
            
            // 更新API参数
            apiParams = {
                stream: streamToggle,
                max_tokens: maxTokens,
                temperature: temperature,
                top_p: topP,
                top_k: topK,
                frequency_penalty: frequencyPenalty,
                stop: stopArray,
                n: 1,
                response_format: {"type": "text"}
            };
            
            // 显示保存成功提示
            showSettingsStatus('设置已保存', 'success');
            
            // 关闭模态框
            setTimeout(() => {
                advancedSettingsModal.classList.add('hidden');
            }, 1500);
            
            console.log('高级设置已保存:', apiParams);
        } catch (error) {
            console.error('保存设置时出错:', error);
            showSettingsStatus('保存失败: ' + error.message, 'error');
        }
    }
    
    function resetAdvancedSettings() {
        // 恢复默认设置
        apiParams = {
            stream: true,
            max_tokens: 2048,
            stop: null,
            temperature: 0.7,
            top_p: 0.7,
            top_k: 50,
            frequency_penalty: 0.5,
            n: 1,
            response_format: {"type": "text"}
        };
        
        // 更新表单UI
        loadAdvancedSettings();
        
        // 显示重置成功提示
        showSettingsStatus('已重置为默认设置', 'success');
    }
    
    function showSettingsStatus(message, type = 'success') {
        const statusElement = document.getElementById('settings-save-status');
        if (!statusElement) return;
        
        statusElement.textContent = message;
        statusElement.className = `text-sm ${type === 'success' ? 'text-green-600' : 'text-red-600'}`;
        statusElement.classList.remove('hidden');
        
        setTimeout(() => {
            statusElement.classList.add('hidden');
        }, 3000);
    }
    
    function copyToClipboard(text) {
        navigator.clipboard.writeText(text)
            .then(() => {
                showTemporaryTooltip('已复制到剪贴板');
            })
            .catch(err => {
                console.error('复制失败:', err);
                showTemporaryTooltip('复制失败，请重试');
            });
    }
    
    function showTemporaryTooltip(message) {
        // 创建一个临时的提示框显示
        const tooltip = document.createElement('div');
        tooltip.className = 'fixed top-4 right-4 bg-gray-800 text-white px-4 py-2 rounded-md shadow-lg z-50';
        tooltip.textContent = message;
        document.body.appendChild(tooltip);
        
        // 添加动画效果
        tooltip.style.opacity = '0';
        tooltip.style.transform = 'translateY(-10px)';
        tooltip.style.transition = 'all 0.3s ease';
        
        setTimeout(() => {
            tooltip.style.opacity = '1';
            tooltip.style.transform = 'translateY(0)';
        }, 10);
        
        // 自动隐藏
        setTimeout(() => {
            tooltip.style.opacity = '0';
            tooltip.style.transform = 'translateY(-10px)';
            
            setTimeout(() => {
                document.body.removeChild(tooltip);
            }, 300);
        }, 2000);
    }
    
    function showErrorNotification(message) {
        showTemporaryTooltip(message);
    }
    
    function viewMarkdown() {
        if (!markdownFile) {
            showErrorNotification('没有可用的Markdown文件');
            return;
        }
        
        if (markdownIframe && markdownViewer) {
            markdownIframe.src = `/api/markdown/${markdownFile}`;
            markdownViewer.classList.remove('hidden');
        }
    }
    
    function renderMarkdown(text) {
        if (!text) return '';
        
        // 如果marked库不存在，简单处理一下
        if (typeof marked === 'undefined') {
            // 简单处理代码块
            text = text.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
            // 处理行内代码
            text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
            return text;
        }
        
        // 替换自定义标题格式
        text = text.replace(/^###\s*(.*?)$/gm, '# $1');
        text = text.replace(/^\*\*\*\s*(.*?)$/gm, '## $1');
        
        // 保护LaTeX公式，防止被Markdown解析器修改
        // 保存数学公式映射
        const mathExpressions = [];
        
        // 替换行内公式：$...$（不允许跨行）
        text = text.replace(/\$([^\$\n]+?)\$/g, function(match, formula) {
            const id = mathExpressions.length;
            mathExpressions.push({ type: 'inline', formula: formula });
            return `%%MATH_INLINE_${id}%%`;
        });
        
        // 替换块级公式：$$...$$（允许多行）
        text = text.replace(/\$\$([\s\S]+?)\$\$/g, function(match, formula) {
            const id = mathExpressions.length;
            mathExpressions.push({ type: 'block', formula: formula });
            return `%%MATH_BLOCK_${id}%%`;
        });
        
        // 替换圆括号或方括号内含有斜杠的内容作为公式
        // 圆括号模式，例如 (a/b)
        text = text.replace(/(\([^)]*\/[^)]*\))/g, function(match, formula) {
            const id = mathExpressions.length;
            mathExpressions.push({ type: 'inline', formula: formula });
            return `%%MATH_INLINE_${id}%%`;
        });
        
        // 方括号模式，例如 [a/b]
        text = text.replace(/(\[[^\]]*\/[^\]]*\])/g, function(match, formula) {
            const id = mathExpressions.length;
            mathExpressions.push({ type: 'inline', formula: formula });
            return `%%MATH_INLINE_${id}%%`;
        });
        
        // 圆括号内含反斜杠，例如 (a\b)
        text = text.replace(/(\([^)]*\\[^)]*\))/g, function(match, formula) {
            const id = mathExpressions.length;
            mathExpressions.push({ type: 'inline', formula: formula });
            return `%%MATH_INLINE_${id}%%`;
        });
        
        // 方括号内含反斜杠，例如 [a\b]
        text = text.replace(/(\[[^\]]*\\[^\]]*\])/g, function(match, formula) {
            const id = mathExpressions.length;
            mathExpressions.push({ type: 'inline', formula: formula });
            return `%%MATH_INLINE_${id}%%`;
        });
        
        // 使用marked库解析Markdown
        marked.setOptions({
            highlight: function(code, lang) {
                if (typeof hljs !== 'undefined') {
                    try {
                        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                        return hljs.highlight(code, { language }).value;
                    } catch (e) {
                        console.error('高亮代码块失败:', e);
                        return code;
                    }
                }
                return code;
            },
            langPrefix: 'hljs language-', // 代码块的CSS前缀
            breaks: true,                 // 允许在换行处换行
            gfm: true,                    // 启用GitHub风格的Markdown
            mangle: false,                // 不转义HTML
            headerIds: true,              // 生成标题ID
            pedantic: false               // 不使用严格模式
        });
        
        // 解析markdown
        try {
            let rendered = marked.parse(text);
            
            // 还原数学公式
            mathExpressions.forEach((expr, id) => {
                if (expr.type === 'inline') {
                    rendered = rendered.replace(`%%MATH_INLINE_${id}%%`, `$${expr.formula}$`);
                } else {
                    rendered = rendered.replace(`%%MATH_BLOCK_${id}%%`, `$$${expr.formula}$$`);
                }
            });
            
            return rendered;
        } catch (e) {
            console.error('Markdown解析错误:', e);
            return text;
        }
    }
    
    function sendMessage(message) {
        const chatInputContainer = document.querySelector('.chat-input-container');
        
        // 检查消息是否为第一条消息
        const isFirstMessage = document.querySelectorAll('.message-container').length === 0;
        
        // 获取当前对话的ID
        const conversationId = document.getElementById('conversation-id')?.value;
        if (!conversationId) {
            showErrorNotification('无法获取对话ID');
            return;
        }
        
        // 生成唯一的消息ID
        const messageId = `message-${Date.now()}`;
        const reasoningId = `reasoning-${Date.now()}`;
        
        // 添加用户消息
        appendMessage('user', message);
        
        // 添加AI回复的占位符（包含打字指示器）
        appendTypingIndicator(messageId, reasoningId);
        
        // 如果是第一条消息，移除新对话样式，使输入框移动到底部
        if (isFirstMessage && chatInputContainer) {
            // 添加一个短暂的延迟，让用户消息先显示出来
            setTimeout(() => {
                chatInputContainer.classList.remove('new-conversation');
            }, 300);
        }
        
        // 滚动到底部
        scrollToBottom();
        
        // 记录开始时间，用于计算响应时间
        const startTime = new Date();
        
        // 获取当前选择的模型
        const selectedModel = document.getElementById('current-model-id')?.value;
        
        // 发送API请求
        fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                conversation_id: conversationId,
                model: selectedModel,
                stream: apiParams.stream,
                max_tokens: apiParams.max_tokens,
                stop: apiParams.stop,
                temperature: apiParams.temperature,
                top_p: apiParams.top_p,
                top_k: apiParams.top_k,
                frequency_penalty: apiParams.frequency_penalty,
                n: apiParams.n,
                response_format: apiParams.response_format
            })
        })
        .then(response => {
            // 计算响应时间
            const responseTime = new Date() - startTime;
            console.log(`服务器响应时间: ${responseTime}ms`);
            
            if (!response.ok) {
                throw new Error('网络响应不正常');
            }
            
            // 检查是否为流式响应
            const isStream = response.headers.get('Content-Type')?.includes('text/event-stream');
            
            if (isStream && apiParams.stream) {
                // 处理流式响应
                return processStreamingResponse(response.body, messageId, reasoningId);
            } else {
                // 处理非流式响应
                return response.json().then(data => {
                    processNonStreamingResponse(data, messageId);
                    return data;
                });
            }
        })
        .catch(error => {
            console.error('Error sending message:', error);
            // 在UI中显示错误
            displayStreamError(messageId, error.message || '发送消息失败，请重试');
        });
    }
    
    function processNonStreamingResponse(data, messageId) {
        // 处理非流式响应的数据
        const messageElement = document.getElementById(messageId);
        if (!messageElement) return;
        
        // 移除打字指示器
        messageElement.innerHTML = '';
        
        if (data.error) {
            // 显示错误信息
            messageElement.innerHTML = `
                <div class="error-message">
                    <p><i class="fas fa-exclamation-triangle mr-2"></i> 错误</p>
                    <p class="text-sm">${data.error}</p>
                </div>
            `;
            return;
        }
        
        // 保存Markdown文件引用
        if (data.markdown_file) {
            markdownFile = data.markdown_file;
            
            // 显示Markdown查看按钮
            const messageContainer = messageElement.closest('.message-container');
            const markdownBtn = messageContainer.querySelector('.view-markdown-btn');
            if (markdownBtn) {
                markdownBtn.style.display = 'block';
            }
        }
        
        // 显示内容
        if (data.content) {
            messageElement.innerHTML = renderMarkdown(data.content);
            
            // 对新内容应用语法高亮
            if (typeof hljs !== 'undefined') {
                messageElement.querySelectorAll('pre code').forEach(block => {
                    hljs.highlightElement(block);
                });
            }
        }
        
        // 更新对话标题（如果有）
        if (data.title_update && currentConversationTitle) {
            currentConversationTitle.textContent = data.title_update.title;
            
            // 更新左侧对话列表中的标题
            const conversationItem = document.querySelector(`.conversation-item[data-id="${data.title_update.id}"] .conversation-title`);
            if (conversationItem) {
                conversationItem.textContent = data.title_update.title;
            }
        }
    }
    
    function processStreamingResponse(stream, messageId, reasoningId) {
        // 创建解码器
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let hasContent = false;
        let hasReasoningContent = false;

        console.log("开始处理流式响应...");

        // 处理流数据
        const readStream = async () => {
            try {
                const reader = stream.getReader();
                
                while (true) {
                    const { done, value } = await reader.read();
                    
                    if (done) {
                        console.log("流结束");
                        // 处理最后可能的残留数据
                        if (buffer.trim()) {
                            try {
                                // 尝试找出data:前缀
                                const dataMatch = buffer.match(/data: (.*?)(\n|$)/);
                                if (dataMatch && dataMatch[1]) {
                                    const data = JSON.parse(dataMatch[1]);
                                    processStreamChunk(data, messageId, reasoningId);
                                    
                                    // 更新内容标记
                                    if (data.content) hasContent = true;
                                    if (data.reasoning_content) hasReasoningContent = true;
                                    
                                    // 处理标题
                                    if (data.title_update) {
                                        updateConversationTitleFromStream(data.title_update);
                                    }
                                    
                                    // 保存markdown文件路径
                                    if (data.markdown_file) {
                                        markdownFile = data.markdown_file;
                                    }
                                }
                            } catch (e) {
                                console.error('解析最终块时出错:', e, buffer);
                            }
                        }
                        
                        // 流处理完成
                        completeStreamProcessing(messageId, reasoningId, hasContent, hasReasoningContent);
                        break;
                    }
                    
                    // 解码数据
                    const chunk = decoder.decode(value, { stream: true });
                    console.log("接收数据块:", chunk);
                    buffer += chunk;
                    
                    // 处理SSE格式的数据 (data: {...}\n\n)
                    const lines = buffer.split('\n\n');
                    if (lines.length > 1) {
                        // 处理除了最后一行外的所有完整行
                        for (let i = 0; i < lines.length - 1; i++) {
                            const line = lines[i].trim();
                            if (line.startsWith('data: ')) {
                                try {
                                    const jsonStr = line.substring(6); // 去掉"data: "前缀
                                    console.log("JSON数据:", jsonStr);
                                    const data = JSON.parse(jsonStr);
                                    processStreamChunk(data, messageId, reasoningId);
                                    
                                    // 更新内容标记
                                    if (data.content) hasContent = true;
                                    if (data.reasoning_content) hasReasoningContent = true;
                                    
                                    // 检测是否包含数学公式，如果包含则立即尝试渲染
                                    if ((data.content && data.content.includes('$')) || 
                                        (data.reasoning_content && data.reasoning_content.includes('$'))) {
                                        // 给个短延迟让内容更新完毕
                                        setTimeout(() => {
                                            const messageElement = document.getElementById(messageId);
                                            if (messageElement) renderMathJax(messageElement);
                                            
                                            if (data.reasoning_content) {
                                                const reasoningElement = document.getElementById(reasoningId);
                                                if (reasoningElement) renderMathJax(reasoningElement);
                                            }
                                        }, 10);
                                    }
                                    
                                    // 处理标题
                                    if (data.title_update) {
                                        updateConversationTitleFromStream(data.title_update);
                                    }
                                    
                                    // 保存markdown文件路径
                                    if (data.markdown_file) {
                                        markdownFile = data.markdown_file;
                                    }
                                } catch (e) {
                                    console.error('解析数据块时出错:', e, line);
                                }
                            }
                        }
                        
                        // 保留最后一行（可能不完整）
                        buffer = lines[lines.length - 1];
                    }
                    
                    // 平滑滚动到底部（如果用户没有向上滚动太多）
                    if (chatMessages && chatMessages.scrollHeight - chatMessages.scrollTop < chatMessages.clientHeight * 2) {
                        chatMessages.scrollTo({
                            top: chatMessages.scrollHeight,
                            behavior: 'smooth'
                        });
                    }
                }
            } catch (error) {
                console.error('读取流时出错:', error);
                displayStreamError(messageId, error.message);
            }
        };
        
        // 开始处理流
        readStream();
    }
    
    function processStreamChunk(data, messageId, reasoningId) {
        const messageElement = document.getElementById(messageId);
        if (!messageElement) {
            console.warn('找不到消息元素:', messageId);
            return;
        }
        
        console.log('处理数据块:', data);
        
        // 处理常规内容
        if (data.content) {
            console.log(`处理内容块: ${data.content.length}个字符`);
            
            // 移除打字指示器样式
            if (messageElement.querySelector('.typing-indicator')) {
                messageElement.innerHTML = '';
            }
            
            // 附加内容
            appendContentToMessage(messageElement, data.content);
            
            // 检查是否包含可能的公式
            const hasFormula = data.content.includes('$') || 
                               data.content.includes('\\(') || 
                               data.content.includes('\\[') ||
                               (data.content.includes('(') && (data.content.includes('/') || data.content.includes('\\'))) ||
                               (data.content.includes('[') && (data.content.includes('/') || data.content.includes('\\')));
            
            // 实时渲染数学公式
            if (typeof MathJax !== 'undefined' && hasFormula) {
                // 检测到可能包含公式的内容，立即渲染
                console.log('检测到公式，应用MathJax');
                renderMathJax(messageElement);
            }
        }
        
        // 处理思考内容
        if (data.reasoning_content) {
            console.log(`处理思考块: ${data.reasoning_content.length}个字符`);
            const reasoningElement = document.getElementById(reasoningId);
            if (reasoningElement) {
                // 根据全局状态设置显示状态
                reasoningElement.style.display = isReasoningVisible ? 'block' : 'none';
                
                // 只在第一次内容时更新标题
                if (reasoningElement.innerHTML === '') {
                    reasoningElement.innerHTML = `
                        <div class="reasoning-header">
                            <i class="fas fa-brain mr-2"></i> 思考过程
                        </div>
                        <div class="reasoning-body"></div>
                    `;
                    
                    // 显示思考过程切换按钮
                    const messageContainer = messageElement.closest('.message-container');
                    const reasoningBtn = messageContainer.querySelector('.reasoning-toggle-top');
                    if (reasoningBtn) {
                        reasoningBtn.style.display = 'flex';
                        // 根据全局状态更新按钮显示
                        reasoningBtn.classList.toggle('active', isReasoningVisible);
                        reasoningBtn.innerHTML = isReasoningVisible 
                            ? '<i class="fas fa-eye-slash mr-1"></i> 隐藏思考过程' 
                            : '<i class="fas fa-brain mr-1"></i> 显示思考过程';
                    }
                }
                
                // 追加内容
                const reasoningBody = reasoningElement.querySelector('.reasoning-body');
                if (reasoningBody) {
                    reasoningBody.textContent += data.reasoning_content;
                    
                    // 检查是否包含可能的公式
                    const hasFormula = data.reasoning_content.includes('$') || 
                                     data.reasoning_content.includes('\\(') || 
                                     data.reasoning_content.includes('\\[') ||
                                     (data.reasoning_content.includes('(') && (data.reasoning_content.includes('/') || data.reasoning_content.includes('\\'))) ||
                                     (data.reasoning_content.includes('[') && (data.reasoning_content.includes('/') || data.reasoning_content.includes('\\')));
                    
                    // 如果思考内容包含数学公式，实时渲染
                    if (typeof MathJax !== 'undefined' && hasFormula) {
                        console.log('思考内容中检测到公式，应用MathJax');
                        renderMathJax(reasoningElement);
                    }
                } else {
                    console.warn('找不到思考内容体元素');
                }
            } else {
                console.warn('找不到思考元素:', reasoningId);
            }
        }
        
        // 处理错误信息
        if (data.error) {
            console.error('接收到错误:', data.error);
            displayStreamError(messageId, data.error);
        }
        
        // 滚动到底部
        scrollToBottom();
    }
    
    function appendContentToMessage(messageElement, content) {
        // 输出调试信息
        console.log(`附加内容: ${content.length}个字符`, content.substring(0, 20) + (content.length > 20 ? '...' : ''));
        
        try {
            // 如果是第一次添加内容，解析整个内容为Markdown
            if (!messageElement.innerHTML || messageElement.querySelector('.typing-indicator')) {
                messageElement.innerHTML = renderMarkdown(content);
            } else {
                // 获取当前积累的原始文本内容
                let currentContent = '';
                
                // 如果之前已经有accumulatedContent属性，使用它
                if (messageElement.hasAttribute('data-content')) {
                    currentContent = messageElement.getAttribute('data-content');
                }
                
                // 累加新内容并存储到元素属性中
                currentContent += content;
                messageElement.setAttribute('data-content', currentContent);
                
                // 使用完整的累积内容重新渲染Markdown
                messageElement.innerHTML = renderMarkdown(currentContent);
            }
            
            // 语法高亮
            if (typeof hljs !== 'undefined') {
                messageElement.querySelectorAll('pre code').forEach(block => {
                    if (!block.classList.contains('hljs')) {
                        try {
                            hljs.highlightElement(block);
                        } catch (e) {
                            console.warn('代码高亮错误:', e);
                        }
                    }
                });
            }
            
            // 渲染LaTeX公式
            renderMathJax(messageElement);
        } catch (error) {
            console.error('附加内容错误:', error);
            // 恢复错误，直接将内容作为纯文本显示
            messageElement.textContent = content;
        }
    }
    
    function completeStreamProcessing(messageId, reasoningId, hasContent, hasReasoningContent) {
        const messageElement = document.getElementById(messageId);
        if (!messageElement) return;
        
        console.log(`流处理完成: hasContent=${hasContent}, hasReasoningContent=${hasReasoningContent}`);
        
        // 移除打字指示器
        if (messageElement.querySelector('.typing-indicator')) {
            messageElement.innerHTML = '';
        }
        
        // 如果没有内容，显示错误
        if (!hasContent && !hasReasoningContent) {
            console.warn('服务器没有返回任何内容');
            messageElement.innerHTML = `
                <div class="error-message">
                    <p><i class="fas fa-exclamation-triangle mr-2"></i> 错误</p>
                    <p class="text-sm">服务器没有返回任何内容</p>
                    <p class="text-xs text-gray-500 mt-2">请尝试刷新页面或检查网络连接</p>
                </div>
            `;
            return;
        }
        
        // 显示Markdown查看按钮
        if (markdownFile) {
            const messageContainer = messageElement.closest('.message-container');
            const markdownBtn = messageContainer.querySelector('.view-markdown-btn');
            if (markdownBtn) {
                markdownBtn.style.display = 'block';
            }
        }
        
        // 渲染LaTeX公式
        console.log('流处理完成，尝试渲染LaTeX公式');
        renderMathJax(messageElement);
        
        // 延迟再次渲染，确保所有内容都已加载
        setTimeout(() => {
            // 检查是否包含可能的公式
            const text = messageElement.textContent;
            const hasFormula = text.includes('$') || 
                               text.includes('\\(') || 
                               text.includes('\\[') ||
                               (text.includes('(') && (text.includes('/') || text.includes('\\'))) ||
                               (text.includes('[') && (text.includes('/') || text.includes('\\')));
                               
            if (hasFormula) {
                console.log('检测到公式，再次尝试渲染');
                if (typeof MathJax !== 'undefined') {
                    MathJax.typesetPromise([messageElement]).catch(error => {
                        console.error('MathJax最终渲染错误:', error);
                    });
                }
            }
        }, 300);
    }
    
    function displayStreamError(messageId, errorMessage) {
        const messageElement = document.getElementById(messageId);
        if (!messageElement) return;
        
        console.error('请求错误:', errorMessage);
        
        // 根据错误消息定制更友好的提示
        let userFriendlyMessage = '与服务器通信时出现问题';
        let suggestion = '请检查网络连接后重试';
        
        if (errorMessage.includes('网络响应不正常')) {
            userFriendlyMessage = '服务器返回了错误响应';
            suggestion = '请检查API配置是否正确，或联系管理员';
        } else if (errorMessage.toLowerCase().includes('failed to fetch') || 
                   errorMessage.toLowerCase().includes('network') ||
                   errorMessage.toLowerCase().includes('connection')) {
            userFriendlyMessage = '网络连接错误';
            suggestion = '请检查您的网络连接是否正常';
        }
        
        messageElement.innerHTML = `
            <div class="error-message">
                <p><i class="fas fa-exclamation-triangle mr-2"></i> 连接错误</p>
                <p class="text-sm">${userFriendlyMessage}</p>
                <p class="text-xs text-gray-500 mt-2">${suggestion}</p>
            </div>
        `;
    }
    
    function updateConversationTitleFromStream(titleData) {
        if (!currentConversationTitle || !titleData) return;
        
        console.log('更新对话标题:', titleData);
        
        // 更新页面上的对话标题
        currentConversationTitle.textContent = titleData.title;
        
        // 更新左侧对话列表中的标题
        const conversationItem = document.querySelector(`.conversation-item[data-id="${titleData.id}"] .conversation-title`);
        if (conversationItem) {
            conversationItem.textContent = titleData.title;
        }
    }
    
    function appendMessage(role, content) {
        if (!chatMessages) return;
        
        const messageContainer = document.createElement('div');
        messageContainer.className = `message-container ${role}`;
        
        messageContainer.innerHTML = `
            <div class="message-content">
                <div class="message-header">
                    <span>${role === 'user' ? '你' : 'AI助手'}</span>
                </div>
                <div class="message-body markdown-body">${renderMarkdown(content)}</div>
                ${role === 'assistant' ? `
                <div class="message-actions-bottom">
                    <div class="actions-row">
                        <button class="action-button like-btn" title="有帮助">
                            <i class="fas fa-thumbs-up"></i>
                        </button>
                        <button class="action-button dislike-btn" title="没帮助">
                            <i class="fas fa-thumbs-down"></i>
                        </button>
                        <button class="action-button regenerate-btn" title="重新回答">
                            <i class="fas fa-redo"></i>
                        </button>
                        <button class="action-button favorite-btn" title="收藏">
                            <i class="far fa-star"></i>
                        </button>
                        <button class="action-button copy-btn" title="复制">
                            <i class="fas fa-copy"></i>
                        </button>
                        <button class="action-button view-markdown-btn" title="查看Markdown" style="display: none;">
                            <i class="fas fa-file-alt"></i>
                        </button>
                    </div>
                </div>
                ` : ''}
            </div>
        `;
        
        chatMessages.appendChild(messageContainer);
        scrollToBottom();
        
        // 获取消息体元素
        const messageBody = messageContainer.querySelector('.message-body');
        
        // 标记原始内容，方便后续重新渲染
        if (messageBody && role === 'assistant' && content.includes('$')) {
            messageBody.setAttribute('data-raw-content', content);
        }
        
        // 语法高亮
        if (typeof hljs !== 'undefined') {
            messageContainer.querySelectorAll('pre code').forEach(block => {
                hljs.highlightElement(block);
            });
        }
        
        // 强化渲染LaTeX公式
        if (messageBody) {
            // 1. 首先直接尝试渲染
            renderMathJax(messageBody);
            
            // 2. 使用短延迟再次渲染，确保内容完全加载
            if (content.includes('$')) {
                setTimeout(() => {
                    renderMathJax(messageBody);
                    
                    // 3. 检查渲染是否成功
                    setTimeout(() => {
                        // 如果没有找到渲染后的MathJax元素，再次尝试
                        if (messageBody.querySelectorAll('.mjx-chtml').length === 0 && 
                            typeof MathJax !== 'undefined') {
                            console.log('检测到公式未正确渲染，重新应用MathJax');
                            MathJax.typesetPromise([messageBody]).catch(error => {
                                console.error('MathJax重新渲染错误:', error);
                            });
                        }
                    }, 300);
                }, 100);
            }
        }
    }
    
    function appendTypingIndicator(messageId, reasoningId) {
        if (!chatMessages) return;
        
        const messageContainer = document.createElement('div');
        messageContainer.className = 'message-container assistant';
        
        messageContainer.innerHTML = `
            <div class="message-content">
                <div class="message-header">
                    <span>AI助手</span>
                    <button class="reasoning-toggle-top" style="display: none;">
                        <i class="fas fa-brain mr-1"></i> 显示思考过程
                    </button>
                </div>
                <div id="${reasoningId}" class="reasoning-content" style="display: none;"></div>
                <div id="${messageId}" class="message-body markdown-body">
                    <div class="typing-indicator">
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                    </div>
                </div>
                <div class="message-actions-bottom">
                    <div class="actions-row">
                        <button class="action-button like-btn" title="有帮助">
                            <i class="fas fa-thumbs-up"></i>
                        </button>
                        <button class="action-button dislike-btn" title="没帮助">
                            <i class="fas fa-thumbs-down"></i>
                        </button>
                        <button class="action-button regenerate-btn" title="重新回答">
                            <i class="fas fa-redo"></i>
                        </button>
                        <button class="action-button favorite-btn" title="收藏">
                            <i class="far fa-star"></i>
                        </button>
                        <button class="action-button copy-btn" title="复制">
                            <i class="fas fa-copy"></i>
                        </button>
                        <button class="action-button view-markdown-btn" title="查看Markdown" style="display: none;">
                            <i class="fas fa-file-alt"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        chatMessages.appendChild(messageContainer);
        scrollToBottom();
    }
    
    // 渲染历史AI消息的Markdown内容
    function renderHistoryMessages() {
        console.log('开始渲染历史消息...');
        
        // 处理所有AI消息
        const assistantMessages = document.querySelectorAll('.message-container.assistant .message-body.markdown-body');
        
        if (assistantMessages.length > 0) {
            console.log(`找到${assistantMessages.length}条AI消息`);
        }
        
        assistantMessages.forEach(function(messageBody) {
            // 跳过已经有脚本标签的消息（inline脚本已经处理过的）
            if (messageBody.querySelector('script')) {
                return;
            }
            
            // 获取消息容器
            const messageContainer = messageBody.closest('.message-container');
            
            // 检查是否有reasoning内容格式
            const reasoningContent = messageContainer.querySelector('.reasoning-content');
            if (reasoningContent) {
                // 确保顶部思考过程按钮可见
                const reasoningToggleTop = messageContainer.querySelector('.reasoning-toggle-top');
                if (reasoningToggleTop) {
                    reasoningToggleTop.style.display = 'flex';
                }
                // 渲染推理部分中的LaTeX公式
                renderMathJax(reasoningContent);
                return;
            }
            
            // 获取原始内容
            let rawContent = '';
            
            // 优先使用data-raw-content属性
            if (messageBody.hasAttribute('data-raw-content')) {
                rawContent = messageBody.getAttribute('data-raw-content');
            } else {
                rawContent = messageBody.textContent.trim();
            }
            
            // 只处理非空消息
            if (rawContent && !rawContent.startsWith('<answer>') && !rawContent.startsWith('Error:')) {
                try {
                    // 记录原始内容到属性，方便后续重新渲染
                    messageBody.setAttribute('data-raw-content', rawContent);
                    
                    // 使用marked渲染内容
                    messageBody.innerHTML = renderMarkdown(rawContent);
                    
                    // 应用语法高亮
                    if (typeof hljs !== 'undefined') {
                        messageBody.querySelectorAll('pre code').forEach(block => {
                            if (!block.classList.contains('hljs')) {
                                hljs.highlightElement(block);
                            }
                        });
                    }
                    
                    // 检测是否包含数学公式
                    if (rawContent.includes('$')) {
                        console.log('检测到包含LaTeX公式的消息，应用MathJax渲染');
                        
                        // 立即渲染LaTeX公式
                        renderMathJax(messageBody);
                        
                        // 延迟再次渲染以确保正确处理
                        setTimeout(() => {
                            if (typeof MathJax !== 'undefined') {
                                MathJax.typesetPromise([messageBody]).catch(error => {
                                    console.error('MathJax渲染错误:', error);
                                });
                            }
                        }, 200);
                    } else {
                        // 普通渲染
                        renderMathJax(messageBody);
                    }
                } catch (e) {
                    console.error('Markdown渲染错误:', e, rawContent);
                    
                    // 错误恢复：直接显示原始内容
                    messageBody.textContent = rawContent;
                }
            }
        });
        
        // 确保所有公式都有机会渲染
        if (typeof MathJax !== 'undefined' && assistantMessages.length > 0) {
            // 延迟500ms进行全局渲染
            setTimeout(() => {
                try {
                    const contentArea = document.querySelector('.chat-messages');
                    if (contentArea) {
                        MathJax.typesetPromise([contentArea]).catch(error => {
                            console.error('全局MathJax渲染错误:', error);
                        });
                    }
                } catch (e) {
                    console.error('尝试全局渲染时出错:', e);
                }
            }, 500);
        }
    }
    
    // 初始化模型选择器
    function initModelSelector() {
        if (!modelSelectButton || !modelDropdown || !vendorList || !modelList) return;
        
        // 获取当前选中的模型（如果存在）
        const currentModel = modelSelector && modelSelector.value ? modelSelector.value : '';
        console.log('当前选中的模型:', currentModel);
        
        // 整理模型列表，确保所有模型都归类到某个供应商下
        let allModels = Array.from(modelSelector.options).map(option => option.value);
        
        // 确定当前模型所属的供应商
        let currentModelVendor = '硅基流动'; // 默认供应商
        
        // 查找当前模型属于哪个供应商
        for (const vendor in modelVendorMap) {
            if (currentModel && modelVendorMap[vendor].some(model => model === currentModel)) {
                currentModelVendor = vendor;
                break;
            }
        }
        
        // 构建供应商列表HTML
        let vendorListHTML = '';
        
        // 为每个供应商创建列表项
        for (const vendor in modelVendorMap) {
            const isActive = vendor === currentModelVendor;
            vendorListHTML += `<div class="vendor-item ${isActive ? 'active' : ''}" data-vendor="${vendor}">
                <i class="fas fa-${getVendorIcon(vendor)} mr-2"></i> ${vendor}
            </div>`;
            
            // 将未分类的模型添加到对应供应商
            allModels.forEach(model => {
                // 如果模型以供应商名称前缀开头，且还未被添加到该供应商的列表中
                if (model.toLowerCase().startsWith(vendor.toLowerCase()) && !modelVendorMap[vendor].includes(model)) {
                    modelVendorMap[vendor].push(model);
                }
            });
        }
        
        // 更新供应商列表
        vendorList.innerHTML = vendorListHTML;
        
        // 显示当前选中供应商的模型列表
        updateModelList(currentModelVendor);
        
        // 点击模型选择按钮显示/隐藏下拉菜单
        modelSelectButton.addEventListener('click', function() {
            modelDropdown.classList.toggle('active');
            modelSelectButton.classList.toggle('active');
        });
        
        // 点击其他区域隐藏下拉菜单
        document.addEventListener('click', function(e) {
            // 检查点击是否在模型选择按钮或下拉菜单内
            const isClickInside = modelSelectButton.contains(e.target) || modelDropdown.contains(e.target);
            
            // 如果点击在搜索框内，不要关闭下拉菜单
            const searchInput = document.getElementById('model-search-input');
            const isClickInSearchInput = searchInput && searchInput.contains(e.target);
            
            // 如果点击在模型项(model-item)上，则在选择模型的逻辑中处理关闭
            const isClickOnModelItem = e.target.closest('.model-item');
            
            // 如果点击在下拉菜单区域但不是具体模型项，不关闭
            if (!isClickInside && !isClickInSearchInput && !modelDropdown.classList.contains('active')) {
                return;
            }
            
            // 如果点击在下拉菜单之外，或者是在具体模型项上，则关闭下拉菜单
            if (!isClickInside || isClickOnModelItem) {
                // 仅当点击不在模型列表区域或搜索框内时才关闭
                if (!isClickInSearchInput && !modelList.contains(e.target) || isClickOnModelItem) {
                    modelDropdown.classList.remove('active');
                    modelSelectButton.classList.remove('active');
                }
            }
        });
        
        // 点击供应商切换模型列表
        vendorList.addEventListener('click', function(e) {
            const vendorItem = e.target.closest('.vendor-item');
            if (vendorItem) {
                // 移除其他供应商的active类
                vendorList.querySelectorAll('.vendor-item').forEach(item => {
                    item.classList.remove('active');
                });
                
                // 添加active类到当前点击的供应商
                vendorItem.classList.add('active');
                
                // 更新模型列表
                const vendor = vendorItem.dataset.vendor;
                updateModelList(vendor);
            }
        });
        
        // 点击模型进行选择
        modelList.addEventListener('click', function(e) {
            const modelItem = e.target.closest('.model-item');
            if (modelItem) {
                const modelValue = modelItem.dataset.model;
                
                // 更新选择器的值
                for (let i = 0; i < modelSelector.options.length; i++) {
                    if (modelSelector.options[i].value === modelValue) {
                        modelSelector.selectedIndex = i;
                        // 触发change事件，确保其他依赖于选择器的逻辑能够执行
                        const event = new Event('change');
                        modelSelector.dispatchEvent(event);
                        break;
                    }
                }
                
                // 更新显示的当前模型
                const selectedModelName = getShortModelName(modelValue);
                currentModelDisplay.textContent = selectedModelName;
                
                // 高亮显示当前选中的模型项
                modelList.querySelectorAll('.model-item').forEach(item => {
                    item.classList.remove('active');
                });
                modelItem.classList.add('active');
                
                // 隐藏下拉菜单
                modelDropdown.classList.remove('active');
                modelSelectButton.classList.remove('active');
                
                console.log('已选择模型:', modelValue);
            }
        });
        
        // 初始化当前模型显示
        if (modelSelector.selectedIndex >= 0) {
            const selectedModelName = getShortModelName(modelSelector.options[modelSelector.selectedIndex].value);
            currentModelDisplay.textContent = selectedModelName;
        }
    }
    
    // 根据供应商更新模型列表
    function updateModelList(vendor) {
        if (!modelList || !modelVendorMap[vendor]) return;
        
        // 获取当前选中的模型
        const currentModel = modelSelector && modelSelector.value ? modelSelector.value : '';
        
        // 添加搜索框
        let modelsHTML = `
        <div class="model-search">
            <input type="text" class="model-search-input" id="model-search-input" placeholder="搜索模型..." autocomplete="off">
            <i class="fas fa-search model-search-icon"></i>
        </div>`;
        
        // 添加模型列表
        let modelsListHTML = '';
        modelVendorMap[vendor].forEach(model => {
            let isSelected = model === currentModel;
            let modelShortName = getShortModelName(model);
            
            // 根据供应商设置不同的徽章
            const badgeText = getBadgeText(vendor);
            
            modelsListHTML += `<div class="model-item ${isSelected ? 'active' : ''}" data-model="${model}" data-search="${modelShortName.toLowerCase()}">
                <span class="vendor-badge">${badgeText}</span>
                ${modelShortName}
            </div>`;
        });
        
        modelsHTML += modelsListHTML || '<div class="p-4 text-gray-500 text-center">没有可用模型</div>';
        
        modelList.innerHTML = modelsHTML;
        
        // 添加搜索框事件监听
        const searchInput = document.getElementById('model-search-input');
        if (searchInput) {
            // 自动聚焦搜索框
            setTimeout(() => {
                searchInput.focus();
            }, 100);
            
            // 输入时过滤模型
            searchInput.addEventListener('input', function(e) {
                const searchTerm = e.target.value.toLowerCase().trim();
                const modelItems = modelList.querySelectorAll('.model-item');
                
                modelItems.forEach(item => {
                    const modelSearchText = item.getAttribute('data-search');
                    if (!searchTerm || modelSearchText.includes(searchTerm)) {
                        item.style.display = '';
                    } else {
                        item.style.display = 'none';
                    }
                });
            });
            
            // 防止点击搜索框时关闭下拉菜单
            searchInput.addEventListener('click', function(e) {
                e.stopPropagation();
            });
        }
    }
    
    // 获取供应商徽章文本
    function getBadgeText(vendor) {
        if (vendor === '硅基流动') {
            return '硅基';
        } else if (vendor === '智谱清言') {
            return 'GLM';
        }
        return vendor.substring(0, 2); // 默认取供应商名称前两个字
    }
    
    // 获取供应商图标
    function getVendorIcon(vendor) {
        if (vendor === '硅基流动') {
            return 'microchip';
        } else if (vendor === '智谱清言') {
            return 'brain';
        }
        return 'cubes'; // 默认图标
    }
    
    // 获取模型简短名称
    function getShortModelName(modelName) {
        // 移除供应商前缀，显示更简洁的名称
        let name = modelName;
        
        // 处理路径形式的模型名称 (如 "deepseek-ai/DeepSeek-V3")
        if (name.includes('/')) {
            name = name.split('/').pop();
        }
        
        // 移除常见前缀
        name = name.replace(/^(Pro\/|deepseek-ai\/|Qwen\/|THUDM\/|internlm\/|TeleAI\/|Vendor-A\/|zhipuai\/)/g, '');
        
        // 如果还有路径，再次分割
        if (name.includes('/')) {
            name = name.split('/').pop();
        }
        
        // 如果原始模型ID以"Pro"开头，添加"（Pro）"后缀
        if (modelName.startsWith('Pro/')) {
            name += '（Pro）';
        }
        
        return name;
    }
});