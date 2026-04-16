# 前置

请先阅读 `./login.md`这个文件了解当前工程的鉴权机制。

## 一些约定

### `.userinfo.json`

用户登录完毕后，用户信息会被存储在 ~/.cache/freecode/.userinfo.json(windows系统中这个路径为 C:/Users/{user_id}/.cache/freecode/.userinfo.json)这个文件中:

```json
{
  "cookie": "xxxxxxxxxxxxx",
  "token": "xxxxxxxxxxxxx"
}
```

`.userinfo.json`文件中会存入上述的信息

### `getUserInfo()`

该函数专门用来读取`.userinfo.json`,返回 `{cookie: 'xxxxxxxx', token: 'yyyyyyyyyyy'}`

### urls

本需求一共涉及4个url，因为业务私密性，这里我都给出fake版本的url，你只要知道是用来做什么的即可。本文后续会使用以下设置好的url代称。

`w3_login_url`: www.loginw3.hw.rnd.com/?redirect=${set_session_url}, 用户点击界面的[登录选项]后打开浏览器前往`www.loginw3.hw.rnd.com/`, 当用户输入完账号密码以后将获取到的cookie存入到后端服务中。
`set_session_url`: 通过指定的session_id存入cookie到后端服务www.hac-y.hw.rnd.com, 假设为www.hac-y.hw.rnd.com/api/v1/set-cookie/${session_id}
`get_session_url`: 通过指定的session_id从后端服务www.hac-y.hw.rnd.com获取cookie
`sso_verify_token_url`: 通过cookie获取到业务用的token(cookie需要作为headers.Cookie的值传递给url)，但是必须保证这个cookie合法，在该接口的后续行为中需要将cookie和对应的token写入上面提到的 `.userinfo.json`

# 需求综述

需要绘制一个登录弹框，弹框内只有一个`w3登录`选项，点击这个选项需要自动打开浏览器，并在浏览器的地址栏内填入 `w3_login_url`, 待用户输入账号密码后自动将cookie通过`set_session_url`存到后端服务。并且在此之后，终端界面正常渲染cli工具应用，登录流程结束

## 触发登录检查

1. 检查终端命令是否包含 `--login` 参数，如果有，则需要执行登录流程(即使当前存在.userinfo.json文件，存在文件的话等于使用新cookie和token来强制更新该文件)，如果没有，则进行下一步
2. 若参数里不带`--login`,检查 ～/.cache/freecode/.userinfo.json是否存在，若不存在，说明此时用户还未使用过该工具，需要执行登录流程
3. 若命令没有`--login`, 并且`.userinfo.json`文件存在，则不触发登录流程，直接正常打开应用。

## 时序

CLI 启动 → 检查是否需要登录 → 生成 session_i(cli端生成) → 打开浏览器(w3_login_url)
→ 用户输入账密 → 浏览器跳转 set_session_url 写入 cookie
→ CLI 轮询 get_session_url 获取 cookie → 调用 sso_verify_token_url 获取 token
→ 写入 .userinfo.json → 登录完成，渲染应用(先短暂地提示渲染成功，后提示消失，渲染应用)
若不需要登录，则直接渲染应用

### 澄清

1. 这里的轮询并不是真的按秒来进行定时任务，只是意思在代码中的登录方法内需要通过访问 get_session_url 这个接口动态获取在服务侧存储的cookie
   这个接口大致会返回标准的response对象，只是内部会有一个'cookie'字段来存储需要的cookie
2. session_id在别的业务工具中使用了`Bun.randomUUIDv7()`
3. 使用fetch方法来访问服务接口，即使是访问`sso_verify_token_url` 也是使用method为`Get`的fetch方法

## 登录面板

除了用户可以点击的'w3登录'，还需要有'取消/关闭'的按钮，可以支持快捷键，这里建议是使用键盘按键Q来进行'取消操作'，用户执行了取消操作后，直接退出进程

## 登录期间

添加提示'正在登录...'

## 登录失败

假设登录失败，需要在面板上展示'用户登录失败，失败原因:'，失败原因后面需要将具体的错误转成字符串展示在面板上

## 与现有的鉴权关系

w3 登录完全替代现有的 OAuth 认证方式
